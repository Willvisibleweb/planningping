-- =============================================================================
-- Migration: mark which councils the scraper can actually handle.
-- Run in the Supabase SQL editor (project vinwnykuumifpctdjxbu).
--
-- The councils table mixed three portal systems all tagged "idox_search_do",
-- but the scraper only understands genuine Idox/servlet portals. "supported"
-- flags the ones it CAN parse — it is NOT a guarantee the portal returns data
-- (that still needs per-council verification from n8n). Used to gate signups so
-- users can't track a council that can't work.
-- =============================================================================

alter table public.councils
  add column if not exists supported boolean not null default true;

-- Non-Idox systems (Northgate / custom) the scraper cannot parse — unsupported.
update public.councils
set supported = false
where slug in (
  'barnet',                  -- custom (planning-register.co.uk)
  'birmingham',              -- Northgate
  'camden',                  -- Northgate
  'islington',               -- Northgate
  'kensington-and-chelsea',  -- custom (.aspx)
  'merton',                  -- Northgate
  'richmond-upon-thames',    -- custom (landing page, no search endpoint)
  'sheffield',               -- custom
  'wandsworth'               -- Northgate
);

create index if not exists idx_councils_supported on public.councils (supported);
