-- Supabase SQL Editor에서 한 번 실행합니다.
create table if not exists public.kingdom_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.kingdom_state enable row level security;
revoke all on public.kingdom_state from anon, authenticated;
-- service_role만 서버에서 접근합니다. 공개 접근 정책을 추가하지 마세요.
