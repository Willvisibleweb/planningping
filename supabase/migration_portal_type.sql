-- =============================================================================
-- Migration: Add portal_type to councils table
-- Run in the Supabase SQL editor after migration_councils.sql.
-- =============================================================================
--
-- Why: Idox portals come in two flavours:
--   idox_search_do  — newer portals, e.g. /online-applications/search.do (GET)
--   idox_servlet    — older portals, e.g. /servlets/ApplicationSearchServlet (POST)
--
-- The n8n scraper reads portal_type at runtime and routes to the correct
-- scrape + parse logic. Default is idox_search_do so existing rows are safe.

alter table public.councils
  add column if not exists portal_type text not null default 'idox_search_do'
    check (portal_type in ('idox_search_do', 'idox_servlet'));

-- Haringey is already in the table as a servlet portal — mark it correctly.
update public.councils
  set portal_type = 'idox_servlet'
  where portal_url like '%/servlets/ApplicationSearchServlet%';

-- Add Staffordshire Moorlands.
-- Slug matches what postcodes.io returns for admin_district on ST10 postcodes.
insert into public.councils (slug, name, portal_url, portal_type, notes) values
  (
    'staffordshire-moorlands',
    'Staffordshire Moorlands',
    'http://publicaccess.staffsmoorlands.gov.uk/portal/servlets/ApplicationSearchServlet',
    'idox_servlet',
    'Older servlet-based Idox portal. Accepts POST with ReceivedDateFrom/ReceivedDateTo in DD/MM/YYYY format. No address filter needed for council-wide scrape.'
  )
on conflict (slug) do update
  set portal_url  = excluded.portal_url,
      portal_type = excluded.portal_type,
      notes       = excluded.notes;
