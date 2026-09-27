-- 로그인 비밀번호를 10분 안에 5번 틀리면 그 이메일은 10분 동안 로그인할 수 없다.
--
-- Supabase 의 서버쪽 비밀번호 검증 훅(Password Verification Hook)은 Teams·Enterprise 요금제 전용이라,
-- 무료 요금제에서는 로그인 화면이 아래 함수로 실패를 기록하고 잠금을 확인한다.
-- 횟수·잠금 시각은 함수 안에서만 바뀌므로 브라우저가 직접 고치거나 지울 수 없다.
-- ponytail: 로그인 화면을 거치지 않고 Auth API 를 직접 부르는 시도는 기록되지 않는다.
--           그 경로는 Supabase 기본 IP 요청 제한이 막는다. 완전한 서버 잠금이 필요하면 Teams 요금제의 훅으로 옮긴다.
-- 주의: 이메일만 알면 누구나 5번 틀려서 그 계정을 10분 잠글 수 있다(잠금 방식의 공통 한계).

create table public.login_failures (
  email text primary key check (char_length(email) between 1 and 320),
  fail_count smallint not null default 0,
  last_failed_at timestamptz not null default now(),
  locked_until timestamptz
);

-- 표는 함수로만 다룬다: RLS 를 켜고 정책을 두지 않으며, 직접 권한도 없앤다
alter table public.login_failures enable row level security;
revoke all on public.login_failures from anon, authenticated;

-- 지금 잠겨 있으면 풀리는 시각, 아니면 null
create or replace function public.login_locked_until(p_email text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select f.locked_until
  from public.login_failures f
  where f.email = lower(trim(p_email)) and f.locked_until > now();
$$;

-- 비밀번호가 틀렸을 때 기록한다. 5번째 실패에서 10분 잠근다.
-- 마지막 실패에서 10분이 지났거나 잠금이 끝났으면 1번부터 다시 센다.
create or replace function public.login_failed(p_email text)
returns table (lock_until timestamptz, attempts_left integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  r public.login_failures;
begin
  if v_email = '' or char_length(v_email) > 320 then
    raise exception 'invalid email';
  end if;

  -- 하루 지난 기록은 지운다 (아무 이메일로 호출해 표를 불리는 것 방지)
  delete from public.login_failures f where f.last_failed_at < now() - interval '1 day';

  insert into public.login_failures as f (email, fail_count, last_failed_at)
  values (v_email, 1, now())
  on conflict (email) do update set
    fail_count = case
      when f.locked_until > now() then f.fail_count
      when f.locked_until is not null or f.last_failed_at < now() - interval '10 minutes' then 1
      else f.fail_count + 1
    end,
    locked_until = case when f.locked_until > now() then f.locked_until end,
    last_failed_at = now()
  returning * into r;

  if r.locked_until is null and r.fail_count >= 5 then
    update public.login_failures f
      set locked_until = now() + interval '10 minutes', fail_count = 0
      where f.email = v_email
      returning * into r;
  end if;

  return query select r.locked_until, greatest(5 - r.fail_count, 0);
end;
$$;

-- 로그인에 성공하면 그 계정의 실패 기록을 지운다 (로그인한 본인 것만)
create or replace function public.login_succeeded()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.login_failures f where f.email = lower(auth.jwt() ->> 'email');
$$;

revoke execute on function public.login_locked_until(text) from public;
revoke execute on function public.login_failed(text) from public;
revoke execute on function public.login_succeeded() from public, anon;
grant execute on function public.login_locked_until(text) to anon, authenticated;
grant execute on function public.login_failed(text) to anon, authenticated;
grant execute on function public.login_succeeded() to authenticated;
