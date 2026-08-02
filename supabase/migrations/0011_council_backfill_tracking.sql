-- 0011: Track when each council was last fetched from PlanIt, from ANY
-- source — the national backfill cron, the daily ingest cron, an instant
-- fetch-on-add, or a radius change. One shared timestamp so:
--   1. The backfill cron can pick up where it left off (oldest/never-fetched
--      first) rather than needing a separate cursor table.
--   2. Instant-fetch code paths can skip a redundant PlanIt call when the
--      council's data is already fresh (see lib/ingest/fetchAndIngestNearby.ts).
--
-- Rollback:
--   alter table public.councils drop column if exists last_planit_fetch_at;

alter table public.councils
  add column if not exists last_planit_fetch_at timestamptz;

create index if not exists idx_councils_last_planit_fetch_at
  on public.councils (last_planit_fetch_at nulls first);
