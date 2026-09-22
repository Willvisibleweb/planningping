-- 0038: the ingest as a queue of per-source jobs, instead of one long function.
--
-- Why: the single-function ingest could not finish. Every recorded run was
-- 'partial' or 'failed' — killed by Vercel at 300s, or rate-limited by PlanIt
-- once it was six sources deep, with the back half of the territory list
-- failing every morning. With 16 tracked areas it was already at its ceiling,
-- so the failure was structural rather than a bad day.
--
-- A planner writes one row per source per day; workers claim a few at a time
-- and each one is small enough to finish comfortably. A source that fails backs
-- off and is retried independently, without costing any other source its slot.
--
-- There is deliberately no separate "retry tomorrow" table. A source that gives
-- up today simply has an older last success, and planSubmissionWindow already
-- reaches back to it on the next run — the recovery window is the retry.

create table if not exists public.ingest_jobs (
  id               uuid primary key default gen_random_uuid(),
  -- The ingest day this job belongs to. With query_key it is the idempotency
  -- key: running the planner twice in one day re-plans nothing.
  plan_date        date not null default (now() at time zone 'utc')::date,
  -- Normalised postcode|radius. Two territories at the same postcode and
  -- radius are one PlanIt query, as they were before.
  query_key        text not null,
  source_key       text not null,
  source_label     text,
  council_slug     text,
  postcode         text not null,
  radius_km        numeric(6,2) not null,
  -- Every tracked_area this query covers, so the alert fan-out and the
  -- last_planit_fetch_at stamp still attribute to the right rows.
  area_ids         uuid[] not null default '{}'::uuid[],
  -- Oldest success among those areas, which decides how far back to recover.
  last_success_at  timestamptz,

  status           text not null default 'pending'
                     check (status in ('pending', 'running', 'done', 'failed')),
  attempts         int not null default 0,
  next_attempt_at  timestamptz not null default now(),
  lease_until      timestamptz,
  claimed_at       timestamptz,
  claimed_by       text,

  run_id           uuid,
  last_error       text,
  last_http_status int,
  result           jsonb not null default '{}'::jsonb,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  finished_at      timestamptz,

  unique (plan_date, query_key)
);

comment on table public.ingest_jobs is
  'One queued PlanIt fetch per source per day. Claimed under a lease by /api/cron/ingest-work; failures back off per source without blocking the rest of the queue.';

-- The claim query's access path: due work for a day, oldest first.
create index if not exists ingest_jobs_due_idx
  on public.ingest_jobs (plan_date, status, next_attempt_at);
create index if not exists ingest_jobs_source_idx
  on public.ingest_jobs (source_key, created_at desc);
create index if not exists ingest_jobs_run_idx
  on public.ingest_jobs (run_id);

alter table public.ingest_jobs enable row level security;
revoke all on public.ingest_jobs from anon, authenticated;
grant select, insert, update, delete on public.ingest_jobs to service_role;

-- Claim a batch of due jobs atomically.
--
-- 'for update skip locked' is what lets two overlapping worker invocations run
-- without both picking up the same source — the second simply skips the locked
-- row and takes the next one.
--
-- Two things worth knowing about the semantics here:
--
--   attempts increments on CLAIM, not on failure. A job whose worker is killed
--     mid-flight never reaches its own error handler, so counting at failure
--     time would let a job that reliably kills the function be retried for
--     ever. Counting at claim time means it gives up like anything else.
--
--   a 'running' row whose lease has passed is claimable again. That is the
--     only way work is recovered from a function Vercel killed.
create or replace function public.claim_ingest_jobs(
  p_plan_date    date,
  p_limit        int default 3,
  p_worker       text default 'worker',
  p_lease_seconds int default 240
)
returns setof public.ingest_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lease timestamptz := now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 240), 900)));
begin
  return query
  with due as (
    select id
      from public.ingest_jobs
     where plan_date = p_plan_date
       and (
         (status = 'pending' and next_attempt_at <= now())
         or (status = 'running' and lease_until is not null and lease_until < now())
       )
     order by next_attempt_at, created_at
     limit greatest(1, least(coalesce(p_limit, 3), 20))
     for update skip locked
  )
  update public.ingest_jobs j
     set status      = 'running',
         attempts    = j.attempts + 1,
         claimed_at  = now(),
         claimed_by  = coalesce(p_worker, 'worker'),
         lease_until = v_lease,
         updated_at  = now()
    from due
   where j.id = due.id
  returning j.*;
end;
$$;

revoke all on function public.claim_ingest_jobs(date, int, text, int) from public, anon, authenticated;
grant execute on function public.claim_ingest_jobs(date, int, text, int) to service_role;

comment on function public.claim_ingest_jobs(date, int, text, int) is
  'Atomically claims up to p_limit due ingest jobs under a lease, including running jobs whose lease expired. Increments attempts on claim so a job that kills its worker still gives up. Service role only.';

-- Rollback:
-- drop function if exists public.claim_ingest_jobs(date, int, text, int);
-- drop table if exists public.ingest_jobs;
