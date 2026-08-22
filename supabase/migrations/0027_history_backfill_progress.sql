-- Resumable history backfill.
--
-- The backfill walks each territory backwards a month at a time, and without
-- somewhere to record progress it restarts at month one on every run. At nine
-- territories that is invisible — the whole job fits in a single run. Past
-- roughly thirty it stops being invisible and starts being fatal: each run
-- re-reads the same recent months, exhausts its time budget in the same place,
-- and never reaches the older ones. Silently, because every run reports success.
--
-- Nullable, and null means "never backfilled", which is also the ordering key:
-- territories with no progress go first, then the least-progressed. The daily
-- ingest already uses exactly this pattern with last_planit_fetch_at, for the
-- same reason — a fixed order starves whatever sits at the back.

alter table public.tracked_areas
  add column if not exists history_backfilled_through date;

comment on column public.tracked_areas.history_backfilled_through is
  'Oldest month the history backfill has reached for this territory. Null = never run. Lets the job resume across runs instead of restarting at month one — see 0027.';
