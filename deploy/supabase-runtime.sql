create table if not exists public.kingdom_runtime_lock (id text primary key, owner_id text, expires_at timestamptz);
alter table public.kingdom_runtime_lock enable row level security;
create or replace function public.kingdom_runtime_lock(owner_id text) returns boolean language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
 insert into kingdom_runtime_lock as l values ('main',owner_id,now()+interval '90 seconds') on conflict(id) do update set owner_id=excluded.owner_id,expires_at=excluded.expires_at where l.expires_at<now();
 get diagnostics changed=row_count;return changed=1;
end $$;
create or replace function public.kingdom_runtime_unlock(owner_id text) returns boolean language plpgsql security definer set search_path=public as $$
begin delete from kingdom_runtime_lock l where l.id='main' and l.owner_id=$1;return found;end $$;
create or replace function public.kingdom_runtime_read() returns jsonb language sql security definer set search_path=public as $$ select data from kingdom_state where id='main' $$;
create or replace function public.kingdom_runtime_save(owner_id text,payload jsonb) returns boolean language plpgsql security definer set search_path=public as $$
begin
 perform 1 from kingdom_runtime_lock l where l.id='main' and l.owner_id=$1 and l.expires_at>now() for update;
 if not found then return false;end if;
 insert into kingdom_state(id,data,updated_at) values('main',payload,now()) on conflict(id) do update set data=excluded.data,updated_at=excluded.updated_at;return true;
end $$;
revoke all on function public.kingdom_runtime_lock(text),public.kingdom_runtime_unlock(text),public.kingdom_runtime_read(),public.kingdom_runtime_save(text,jsonb) from public,anon,authenticated;
grant execute on function public.kingdom_runtime_lock(text),public.kingdom_runtime_unlock(text),public.kingdom_runtime_read(),public.kingdom_runtime_save(text,jsonb) to service_role;
create or replace function public.kingdom_runtime_begin(owner_id text) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not kingdom_runtime_lock(owner_id) then return jsonb_build_object('acquired',false);end if;
 return jsonb_build_object('acquired',true,'data',kingdom_runtime_read());
end $$;
create or replace function public.kingdom_runtime_commit(owner_id text,payload jsonb) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if payload is not null and not kingdom_runtime_save(owner_id,payload) then return false;end if;
 return kingdom_runtime_unlock(owner_id);
end $$;
revoke all on function public.kingdom_runtime_begin(text),public.kingdom_runtime_commit(text,jsonb) from public,anon,authenticated;
grant execute on function public.kingdom_runtime_begin(text),public.kingdom_runtime_commit(text,jsonb) to service_role;
