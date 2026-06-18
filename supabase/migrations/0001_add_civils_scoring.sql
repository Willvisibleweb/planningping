-- =============================================================================
-- Migration: add civils lead-scoring columns to planning_applications
-- Run this in the Supabase SQL editor (project vinwnykuumifpctdjxbu).
--
-- This is additive and isolated — it does NOT touch the scraper, the webhook,
-- or the existing alert/email flow. Scores are written by the scoring backfill
-- route (/api/score), not by the scraper. Safe to drop later if this direction
-- dies (see the rollback block at the bottom).
-- =============================================================================

alter table public.planning_applications
  add column if not exists score         int,
  add column if not exists band          text
    check (band in ('HOT', 'WARM', 'COLD')),
  add column if not exists score_reasons jsonb;  -- string[] of matchedReasons

-- Index for the dashboard's "filter by band" query.
create index if not exists idx_planning_applications_band
  on public.planning_applications (band);

-- No RLS changes needed: these columns ride on the existing
-- "select if tracking council" policy. Writes happen via the service role.

-- -----------------------------------------------------------------------------
-- ROLLBACK (paste into SQL editor if you kill the scoring direction):
-- -----------------------------------------------------------------------------
-- drop index if exists idx_planning_applications_band;
-- alter table public.planning_applications
--   drop column if exists score,
--   drop column if exists band,
--   drop column if exists score_reasons;
