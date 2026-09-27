-- 추억 안의 장소 순서(visit_order)를 사진 촬영 시각 순서로 다시 매긴다.
-- 장소마다 "가장 이른 촬영 시각"으로 정렬하고, 촬영 시각이 없는 장소는 올린 시각(created_at)으로 대신한다.
-- (그래서 시간 정보가 없는 장소는 올린 순서대로 뒤쪽에 놓인다)
-- 사진을 올린 뒤 앱이 한 번 부른다: supabase.rpc('reorder_places', { p_event_id })
--
-- places 에 unique (event_id, visit_order) 가 있어서 바로 번호를 바꾸면 중간에 겹칠 수 있다.
-- 그래서 먼저 음수로 비켜 놓은 뒤 최종 번호를 매긴다.
-- security invoker: 부른 사람의 권한으로 실행되므로 기존 RLS(두 멤버만)가 그대로 적용된다.

create or replace function public.reorder_places(p_event_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.places set visit_order = -visit_order - 1 where event_id = p_event_id;

  update public.places p
  set visit_order = r.rn - 1
  from (
    select pl.id,
           row_number() over (order by coalesce(min(ph.taken_at), pl.created_at), pl.created_at, pl.id) as rn
    from public.places pl
    left join public.photos ph on ph.place_id = pl.id
    where pl.event_id = p_event_id
    group by pl.id
  ) r
  where p.id = r.id;
$$;

revoke execute on function public.reorder_places(uuid) from public, anon;
grant execute on function public.reorder_places(uuid) to authenticated;
