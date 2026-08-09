-- Hold public SEO data back by 7 days.
--
-- The 161 public location pages exist to be found on Google, and they need
-- real content to rank. But they were showing applications the moment they
-- landed — and being first is the entire thing PlanningPing sells. A visitor
-- could read this week's applications for their council without paying.
--
-- So: the public pages keep everything older than a week, and knowing about
-- something in its first week becomes a paid feature. Same shape as delayed
-- market data — free is yesterday's, live costs money.
--
-- This lives in the view rather than in the page's query on purpose. The view
-- is granted to the anon role, so it is reachable directly over the REST API
-- with the publishable key that ships in the browser bundle. Filtering only in
-- lib/seo/applications.ts would have left that route wide open, and anyone
-- who opened devtools could have pulled the fresh set anyway.
--
-- Rows with no application_date are excluded too: their age can't be
-- established, so they can't be shown to have cleared the delay. That is
-- 7 rows out of 2,937 today.

create or replace view public.public_applications as
  select
    id, council_slug, reference, address, description, status,
    application_date, decision_date, postcode_district, created_at
  from public.planning_applications
  where application_date is not null
    and application_date <= current_date - interval '7 days';

comment on view public.public_applications is
  'Public SEO surface. Deliberately excludes score/band/score_reasons/raw_data, and holds applications back for 7 days — being first is a paid feature. Reachable by the anon role, so any tightening belongs here, not in the page query.';

-- The grant survives create-or-replace, but re-stating it keeps this migration
-- self-contained if the view is ever rebuilt from scratch.
grant select on public.public_applications to anon, authenticated;
