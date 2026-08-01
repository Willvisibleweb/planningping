-- 0010: Prepare councils for PlanIt-sourced ingestion.
--
-- We're moving off per-council Idox scraping onto the PlanIt API (one source for
-- ~420 UK authorities). PlanIt-era councils are onboarded automatically from the
-- API and have no scraped portal_url — we now store a per-application deep link
-- (in planning_applications.raw_data.url) instead. So portal_url becomes
-- nullable. Existing rows are unaffected.
--
-- Rollback:
--   -- (only if every row has a portal_url again)
--   alter table public.councils alter column portal_url set not null;

alter table public.councils alter column portal_url drop not null;
