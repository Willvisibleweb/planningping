-- 0031: cache application summaries, and index the column the trade filters
-- actually query.
--
-- Two unrelated-looking changes that share a cause: the trade filters have
-- never once run successfully in production (they were sending Postgres
-- array-literal syntax at a jsonb column and 400ing every time), so nothing
-- here has ever been measured under real use. Both parts are about the
-- queries that are about to start happening for the first time.

-- ---------------------------------------------------------------------------
-- 1. Summary cache
-- ---------------------------------------------------------------------------
--
-- An application summary is derived purely from the council's own description.
-- Nothing about it is specific to the user who asked for it — the prompt writes
-- for "a construction contractor" in general, not for one firm's trades — so
-- regenerating it per viewer is paying repeatedly for the same paragraph.
--
-- Cached on the row, it is generated once and read by everyone afterwards:
-- instant on repeat views, and it stops consuming the daily allowance for a
-- summary somebody already produced.
--
-- Written only by the service role. planning_applications has a SELECT policy
-- and nothing else, so users cannot write these and no new policy is added —
-- the route uses the admin client for this one column.

alter table public.planning_applications
  add column if not exists ai_summary    text,
  add column if not exists ai_summary_at timestamptz;

comment on column public.planning_applications.ai_summary is
  'Plain-English summary of description, generated on first request and shared by all viewers. Cleared automatically when description changes — see clear_stale_ai_summary. Set NULL in bulk to force regeneration after a prompt or model change.';

comment on column public.planning_applications.ai_summary_at is
  'When ai_summary was generated. Lets a future prompt change target only summaries older than a given date.';

-- The ingest re-upserts existing rows, so a council that revises a description
-- would otherwise leave a summary describing the old scheme — confidently, and
-- with no way to tell from the UI. Cheaper to enforce here than to remember it
-- at every write site.
create or replace function public.clear_stale_ai_summary()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.ai_summary    := null;
  new.ai_summary_at := null;
  return new;
end;
$$;

drop trigger if exists trg_clear_stale_ai_summary on public.planning_applications;

create trigger trg_clear_stale_ai_summary
  before update on public.planning_applications
  for each row
  -- Only when the source text actually moved. An unchanged re-upsert, or the
  -- route writing the summary itself, must not clear it.
  when (new.description is distinct from old.description)
  execute function public.clear_stale_ai_summary();

-- ---------------------------------------------------------------------------
-- 2. Trade filter index
-- ---------------------------------------------------------------------------
--
-- Every trade filter in the product runs `score_reasons @> '["..."]'`, which
-- without a GIN index is a sequential scan plus a jsonb containment test on
-- every row. Tolerable at today's row count and not something to discover
-- later on a page a customer is waiting for.
--
-- jsonb_path_ops rather than the default: half the size and faster for @>,
-- which is the only operator these queries use.

create index if not exists idx_pa_score_reasons_gin
  on public.planning_applications
  using gin (score_reasons jsonb_path_ops);

-- Rollback:
-- drop trigger if exists trg_clear_stale_ai_summary on public.planning_applications;
-- drop function if exists public.clear_stale_ai_summary();
-- alter table public.planning_applications drop column if exists ai_summary, drop column if exists ai_summary_at;
-- drop index if exists public.idx_pa_score_reasons_gin;
