-- PhotoShare 보강: Data API 권한을 명시하고, 비로그인(anon) 접근을 막는다.
-- Supabase 대시보드 > SQL Editor에서 이 파일 전체를 실행한다. 여러 번 실행해도 안전하다.
--
-- 왜 필요한가
-- 1) 2026-10-30부터 새 테이블은 Data API에 자동으로 열리지 않는다(Supabase changelog).
--    지금은 열려 있지만, 권한을 명시해 두어야 이후에도 같은 동작이 보장된다.
-- 2) public 스키마의 함수는 기본적으로 누구나(anon 포함) RPC로 호출할 수 있다.
--    is_member()는 security definer 라서 로그인한 사용자만 호출하도록 좁힌다.

-- 테이블: 로그인 사용자만 (행 단위 접근은 기존 RLS 정책이 추가로 제한)
revoke all on public.members, public.events, public.places, public.photos from anon;
grant select on public.members to authenticated;
grant select, insert, update, delete on public.events, public.places, public.photos to authenticated;

-- 함수: 로그인 사용자만 실행
revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

revoke execute on function public.places_in_bounds(numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.places_in_bounds(numeric, numeric, numeric, numeric) to authenticated;

revoke execute on function public.events_within_radius(numeric, numeric, integer) from public, anon;
grant execute on function public.events_within_radius(numeric, numeric, integer) to authenticated;
