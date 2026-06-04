-- =============================================================================
-- Migration: Add councils table
-- Run this in the Supabase SQL editor AFTER running schema.sql.
-- =============================================================================
--
-- Why this table exists:
--   postcodes.io tells us which council a postcode belongs to (e.g. "westminster").
--   We store that as council_slug in tracked_areas. But n8n needs a URL to actually
--   scrape. This table maps slug → Idox portal URL. n8n queries it at runtime
--   to know where to scrape for each tracked council.
--
-- Idox is used by ~200 UK councils. Add rows as users track new areas.
-- The portal_url should be the base URL of the council's Idox system,
-- e.g. https://idoxpa.westminster.gov.uk/online-applications

create table public.councils (
  slug          text primary key,             -- Matches council_slug in tracked_areas
  name          text not null,               -- Human-readable, e.g. "Westminster"
  portal_url    text not null,               -- Idox base URL, no trailing slash
  is_supported  boolean not null default true, -- Set false to disable scraping
  notes         text,                         -- Any quirks about this council's portal
  created_at    timestamptz not null default now()
);

alter table public.councils enable row level security;

-- Everyone (authenticated) can read council data — it's not sensitive.
create policy "councils: read by authenticated users"
  on public.councils for select
  to authenticated
  using (true);

-- Only service role (n8n) can insert/update/delete.
-- No direct-insert policy means anon and authenticated users cannot modify this table.


-- =============================================================================
-- Seed data — common Idox councils
-- Add more as your users track them. Slugs must match what postcodes.io returns
-- for admin_district, lowercased and hyphened.
-- =============================================================================
insert into public.councils (slug, name, portal_url) values
  ('westminster',             'Westminster',              'https://idoxpa.westminster.gov.uk/online-applications'),
  ('camden',                  'Camden',                   'https://planningrecords.camden.gov.uk/Northgate/PlanningExplorer'),
  ('islington',               'Islington',                'https://planning.islington.gov.uk/Northgate/PlanningExplorer'),
  ('hackney',                 'Hackney',                  'https://planning.hackney.gov.uk/online-applications'),
  ('tower-hamlets',           'Tower Hamlets',            'https://development.towerhamlets.gov.uk/online-applications'),
  ('southwark',               'Southwark',                'https://planning.southwark.gov.uk/online-applications'),
  ('lambeth',                 'Lambeth',                  'https://planning.lambeth.gov.uk/online-applications'),
  ('wandsworth',              'Wandsworth',               'https://planning.wandsworth.gov.uk/Northgate/PlanningExplorer'),
  ('kensington-and-chelsea',  'Kensington and Chelsea',   'https://www.rbkc.gov.uk/planning/searches/default.aspx'),
  ('hammersmith-and-fulham',  'Hammersmith and Fulham',   'https://public.lbhf.gov.uk/online-applications'),
  ('ealing',                  'Ealing',                   'https://pam.ealing.gov.uk/online-applications'),
  ('brent',                   'Brent',                    'https://pa.brent.gov.uk/online-applications'),
  ('haringey',                'Haringey',                 'https://www.planningservices.haringey.gov.uk/portal/servlets/ApplicationSearchServlet'),
  ('barnet',                  'Barnet',                   'https://barnet.planning-register.co.uk'),
  ('enfield',                 'Enfield',                  'https://planningandbuildingcontrol.enfield.gov.uk/online-applications'),
  ('waltham-forest',          'Waltham Forest',           'https://planning.walthamforest.gov.uk/online-applications'),
  ('newham',                  'Newham',                   'https://pa.newham.gov.uk/online-applications'),
  ('greenwich',               'Greenwich',                'https://planning.royalgreenwich.gov.uk/online-applications'),
  ('lewisham',                'Lewisham',                 'https://planning.lewisham.gov.uk/online-applications'),
  ('bromley',                 'Bromley',                  'https://searchapplications.bromley.gov.uk/online-applications'),
  ('croydon',                 'Croydon',                  'https://publicaccess.croydon.gov.uk/online-applications'),
  ('merton',                  'Merton',                   'https://planning.merton.gov.uk/Northgate/PlanningExplorer'),
  ('kingston-upon-thames',    'Kingston upon Thames',     'https://publicaccess.kingston.gov.uk/online-applications'),
  ('richmond-upon-thames',    'Richmond upon Thames',     'https://www.richmond.gov.uk/council/how_we_work/richmond_online/planning_online'),
  ('bristol-city-of',         'Bristol',                  'https://pa.bristol.gov.uk/online-applications'),
  ('leeds',                   'Leeds',                    'https://publicaccess.leeds.gov.uk/online-applications'),
  ('manchester',              'Manchester',               'https://pa.manchester.gov.uk/online-applications'),
  ('birmingham',              'Birmingham',               'https://eplanning.birmingham.gov.uk/Northgate/PlanningExplorer'),
  ('sheffield',               'Sheffield',                'https://planningregister.sheffield.gov.uk'),
  ('liverpool',               'Liverpool',                'https://planning.liverpool.gov.uk/online-applications')
on conflict (slug) do nothing;
