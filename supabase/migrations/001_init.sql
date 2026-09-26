-- PhotoShare 초기 스키마
-- 개념: 이벤트(특정 날짜의 데이트) 1 : N 장소(방문 순서대로) 1 : N 사진
-- Supabase 대시보드 > SQL Editor에서 이 파일 전체를 실행한다.

-- ---------------------------------------------------------------------------
-- 0. 공통: updated_at 자동 갱신 트리거 함수
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. members: 앱을 쓸 수 있는 두 계정만 등록
--    Auth에서 계정 2개를 만든 뒤, 아래 insert 예시로 user id를 넣는다.
-- ---------------------------------------------------------------------------
create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger members_set_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();

-- RLS 정책에서 재사용하는 멤버 판별 함수
-- security definer: members 테이블 자체의 RLS를 우회해 재귀를 막는다.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 2. events
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  description text,
  event_date date not null,
  cover_photo_id uuid, -- photos 생성 후 아래에서 FK 추가
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_event_date_idx on public.events (event_date desc);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. places: 한 이벤트 안에서 방문한 장소. visit_order로 이동 경로(polyline)를 그린다.
--    같은 실제 장소를 다른 날 또 가면 이벤트마다 별도 행이 생긴다.
--    (한 장소-여러 이벤트 케이스는 좌표로 묶어서 화면에서 처리)
--    name은 사용자가 직접 입력한 값만 저장한다. (네이버 역지오코딩 결과 저장 금지)
-- ---------------------------------------------------------------------------
create table public.places (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  visit_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, visit_order)
);

create index places_event_id_idx on public.places (event_id);
create index places_lat_lng_idx on public.places (latitude, longitude);

create trigger places_set_updated_at
  before update on public.places
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. photos
--    storage_path: Storage 'photos' 버킷 안의 경로
--    taken_at / latitude / longitude: EXIF 또는 수동 입력 값 (원본 보존용)
-- ---------------------------------------------------------------------------
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  storage_path text not null unique,
  thumbnail_path text,
  taken_at timestamptz,
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),
  width integer,
  height integer,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index photos_place_id_idx on public.photos (place_id);

create trigger photos_set_updated_at
  before update on public.photos
  for each row execute function public.set_updated_at();

alter table public.events
  add constraint events_cover_photo_id_fkey
  foreign key (cover_photo_id) references public.photos (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 5. RLS: 두 멤버는 모든 데이터를 함께 조회·편집, 그 외(비로그인 포함)는 접근 불가
-- ---------------------------------------------------------------------------
alter table public.members enable row level security;
alter table public.events enable row level security;
alter table public.places enable row level security;
alter table public.photos enable row level security;

-- members: 멤버끼리 서로 조회만 가능. 추가/삭제는 대시보드(service role)에서만.
create policy "members can read members"
  on public.members for select
  to authenticated
  using (public.is_member());

create policy "members can read events"
  on public.events for select to authenticated using (public.is_member());
create policy "members can insert events"
  on public.events for insert to authenticated with check (public.is_member());
create policy "members can update events"
  on public.events for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy "members can delete events"
  on public.events for delete to authenticated using (public.is_member());

create policy "members can read places"
  on public.places for select to authenticated using (public.is_member());
create policy "members can insert places"
  on public.places for insert to authenticated with check (public.is_member());
create policy "members can update places"
  on public.places for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy "members can delete places"
  on public.places for delete to authenticated using (public.is_member());

create policy "members can read photos"
  on public.photos for select to authenticated using (public.is_member());
create policy "members can insert photos"
  on public.photos for insert to authenticated with check (public.is_member());
create policy "members can update photos"
  on public.photos for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy "members can delete photos"
  on public.photos for delete to authenticated using (public.is_member());

-- ---------------------------------------------------------------------------
-- 6. Storage: 비공개 'photos' 버킷 + 멤버 전용 정책
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos',
  'photos',
  false,
  10485760, -- 10MB (클라이언트에서 압축 후 업로드)
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

create policy "members can read photo files"
  on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_member());
create policy "members can upload photo files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_member());
create policy "members can update photo files"
  on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.is_member());
create policy "members can delete photo files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_member());

-- ---------------------------------------------------------------------------
-- 7. 조회 함수
-- ---------------------------------------------------------------------------

-- 화면에 보이는 지도 범위(bounds) 안의 장소 + 이벤트 정보
-- 사용: supabase.rpc('places_in_bounds', { min_lat, min_lng, max_lat, max_lng })
create or replace function public.places_in_bounds(
  min_lat numeric,
  min_lng numeric,
  max_lat numeric,
  max_lng numeric
)
returns table (
  place_id uuid,
  place_name text,
  latitude numeric,
  longitude numeric,
  visit_order smallint,
  event_id uuid,
  event_title text,
  event_date date,
  cover_photo_id uuid
)
language sql
stable
security invoker -- 호출자 권한으로 실행되므로 위 RLS가 그대로 적용된다
as $$
  select p.id, p.name, p.latitude, p.longitude, p.visit_order,
         e.id, e.title, e.event_date, e.cover_photo_id
  from public.places p
  join public.events e on e.id = p.event_id
  where p.latitude between min_lat and max_lat
    and p.longitude between min_lng and max_lng
  order by e.event_date desc, p.visit_order;
$$;

-- 기준 좌표에서 반경(미터) 안에 장소가 있는 이벤트 (가까운 순)
-- PostGIS 없이 하버사인 공식 사용. 두 사람이 쓰는 데이터 규모에서는 충분하다.
-- 사용: supabase.rpc('events_within_radius', { center_lat: 37.5665, center_lng: 126.9780, radius_m: 3000 })
create or replace function public.events_within_radius(
  center_lat numeric,
  center_lng numeric,
  radius_m integer
)
returns table (
  event_id uuid,
  title text,
  event_date date,
  nearest_place_name text,
  distance_m double precision
)
language sql
stable
security invoker
as $$
  with distances as (
    select p.event_id, p.name,
           6371000 * 2 * asin(sqrt(
             power(sin(radians(p.latitude - center_lat) / 2), 2)
             + cos(radians(center_lat)) * cos(radians(p.latitude))
             * power(sin(radians(p.longitude - center_lng) / 2), 2)
           )) as distance_m
    from public.places p
    -- 인덱스를 타도록 대략적인 사각형으로 먼저 거른다 (위도 1도 ≈ 111km)
    where p.latitude between center_lat - radius_m / 111000.0
                         and center_lat + radius_m / 111000.0
  ),
  nearest as (
    select distinct on (event_id) event_id, name, distance_m
    from distances
    where distance_m <= radius_m
    order by event_id, distance_m
  )
  select e.id, e.title, e.event_date, n.name, n.distance_m
  from nearest n
  join public.events e on e.id = n.event_id
  order by n.distance_m;
$$;

-- ---------------------------------------------------------------------------
-- 8. 멤버 등록 (Auth에서 계정 2개를 만든 뒤, 실제 user id로 바꿔 실행)
-- ---------------------------------------------------------------------------
-- insert into public.members (user_id, display_name) values
--   ('00000000-0000-0000-0000-000000000001', '나'),
--   ('00000000-0000-0000-0000-000000000002', '상대');
