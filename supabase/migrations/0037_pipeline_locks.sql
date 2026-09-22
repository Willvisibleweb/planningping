-- 0037: durable leases for long-running pipeline jobs.
--
-- Vercel cron can be retried or invoked manually while another run is still
-- active. A serverless function can also die before it reaches its cleanup
-- code. This table stores a short-lived lease in Postgres so only one PlanIt
-- pipeline job runs at a time, and a killed function naturally releases itself
-- when locked_until passes.

create table if not exists public.pipeline_locks (
  name         text primary key,
  owner_token  uuid not null,
  locked_until timestamptz not null,
  acquired_at  timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),
  metadata     jsonb not null default '{}'::jsonb
);

comment on table public.pipeline_locks is
  'Short-lived leases for cron/pipeline jobs. A row may be stolen only after locked_until passes.';

alter table public.pipeline_locks enable row level security;
revoke all on public.pipeline_locks from anon, authenticated;
grant select, insert, update, delete on public.pipeline_locks to service_role;

create or replace function public.acquire_pipeline_lock(
  p_name text,
  p_ttl_seconds int default 600,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := gen_random_uuid();
  v_until timestamptz := now() + make_interval(secs => greatest(30, least(coalesce(p_ttl_seconds, 600), 3600)));
  v_row public.pipeline_locks%rowtype;
  v_existing_until timestamptz;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'lock name is required' using errcode = '22023';
  end if;

  insert into public.pipeline_locks as l (name, owner_token, locked_until, acquired_at, refreshed_at, metadata)
  values (p_name, v_owner, v_until, now(), now(), coalesce(p_metadata, '{}'::jsonb))
  on conflict (name) do update
    set owner_token = excluded.owner_token,
        locked_until = excluded.locked_until,
        acquired_at = excluded.acquired_at,
        refreshed_at = excluded.refreshed_at,
        metadata = excluded.metadata
    where l.locked_until <= now()
  returning * into v_row;

  if found then
    return jsonb_build_object(
      'acquired', true,
      'name', v_row.name,
      'owner_token', v_row.owner_token,
      'locked_until', v_row.locked_until
    );
  end if;

  select locked_until into v_existing_until
    from public.pipeline_locks
   where name = p_name;

  return jsonb_build_object(
    'acquired', false,
    'name', p_name,
    'locked_until', v_existing_until
  );
end;
$$;

create or replace function public.release_pipeline_lock(
  p_name text,
  p_owner_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_released boolean;
begin
  update public.pipeline_locks
     set locked_until = now(),
         refreshed_at = now()
   where name = p_name
     and owner_token = p_owner_token
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

revoke all on function public.acquire_pipeline_lock(text, int, jsonb) from public, anon, authenticated;
grant execute on function public.acquire_pipeline_lock(text, int, jsonb) to service_role;

revoke all on function public.release_pipeline_lock(text, uuid) from public, anon, authenticated;
grant execute on function public.release_pipeline_lock(text, uuid) to service_role;

comment on function public.acquire_pipeline_lock(text, int, jsonb) is
  'Attempts to acquire a short-lived pipeline lease. Returns {acquired:true, owner_token, locked_until} or {acquired:false, locked_until}. Service role only.';

comment on function public.release_pipeline_lock(text, uuid) is
  'Releases a pipeline lease only when the caller still owns the owner_token. Service role only.';

-- Rollback:
-- drop function if exists public.release_pipeline_lock(text, uuid);
-- drop function if exists public.acquire_pipeline_lock(text, int, jsonb);
-- drop table if exists public.pipeline_locks;
