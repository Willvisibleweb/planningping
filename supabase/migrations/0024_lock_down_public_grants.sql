-- Close the write access anon and authenticated hold over reference data.
--
-- Found via the Supabase advisor, which flagged two issues. Investigating them
-- turned up a third that it did not flag, and which is the serious one.
--
-- What was actually true before this migration:
--
--   * anon and authenticated held INSERT, UPDATE, DELETE and TRUNCATE on every
--     table in public — councils, seo_towns, planning_applications, and both
--     views. The anon key ships in the browser bundle by design, so these were
--     available to anyone who viewed source.
--
--   * councils and seo_towns had no RLS at all, so nothing stood between those
--     grants and the data. Verified against the live API with the publishable
--     key: an INSERT into seo_towns returned 23502 (not-null violation) rather
--     than 42501 (permission denied), meaning the permission check had already
--     passed and only the payload stopped it. `delete from councils` would have
--     taken out the council registry, the ingest and all 161 SEO pages.
--
--   * public_applications is an auto-updatable view (information_schema reports
--     is_updatable = YES, is_insertable_into = YES) over planning_applications,
--     and runs as its owner. planning_applications does have RLS, but a write
--     through the view executes as postgres and never consults it — so the
--     grants above were a way around the one table that was protected. This is
--     the issue the advisor did not raise.
--
-- The fix is grants, not policies: these roles have no legitimate reason to
-- write any of this. Every write to councils, seo_towns and planning_applications
-- comes from the service role (createAdminClient in the ingest, backfill and
-- area-creation paths), which bypasses both grants and RLS and is unaffected.
-- The browser client is used only for auth — logout and the 2FA challenge —
-- and never writes data.

-- 1. Reference and public data: readable by anyone, writable by no one but the
--    service role. REFERENCES and TRIGGER go too; neither role has any business
--    adding a foreign key or a trigger.
revoke insert, update, delete, truncate, references, trigger
  on public.councils, public.seo_towns, public.planning_applications
  from anon, authenticated;

-- 2. The views. seo_locations aggregates and so is not updatable, but the grant
--    is meaningless there anyway; public_applications is the one that matters.
revoke insert, update, delete, truncate, references, trigger
  on public.public_applications, public.seo_locations
  from anon, authenticated;

-- 3. RLS on the two tables that had none. The grants above are already the real
--    control, but a public table with RLS off has no second line of defence if
--    a grant is ever restored by hand or by a future migration.
alter table public.councils  enable row level security;
alter table public.seo_towns enable row level security;

-- Read stays open to everyone: both tables are public reference data, and the
-- SEO pages are served to signed-out visitors.
drop policy if exists "councils: public read" on public.councils;
create policy "councils: public read"
  on public.councils for select
  to anon, authenticated
  using (true);

drop policy if exists "seo_towns: public read" on public.seo_towns;
create policy "seo_towns: public read"
  on public.seo_towns for select
  to anon, authenticated
  using (true);

-- No insert/update/delete policy is defined on either table on purpose. With
-- RLS enabled and no policy for a command, that command is denied outright —
-- which is exactly what is wanted for both roles.

-- Deliberately NOT changed: the views stay SECURITY DEFINER (no
-- security_invoker), which is the advisor's second finding. It is load-bearing.
-- planning_applications' select policy requires an active tracked_area for the
-- council, and a signed-out visitor has none, so switching these views to
-- security_invoker would empty every public location page. Running as owner is
-- how the public pages see anything at all.
--
-- That is safe because of what the views expose rather than by luck:
-- public_applications selects a curated column list — no score, no band, no
-- raw_data, no agent_company — and withholds anything newer than 7 days, so
-- fresh data stays a paid feature. seo_locations returns only names and counts.
-- With writes revoked above, the definer property is now read-only in practice.

comment on view public.public_applications is
  'Public projection of planning_applications for signed-out SEO pages: curated columns only, and nothing newer than 7 days so fresh data stays paid. Intentionally SECURITY DEFINER — the base table''s RLS requires a tracked area, which a visitor has not got. Writes are revoked from anon and authenticated (see 0024); do not re-grant them, the view is auto-updatable and would bypass the base table''s RLS.';
