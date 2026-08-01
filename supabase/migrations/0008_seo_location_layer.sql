-- 0008: Programmatic SEO location layer (Phase 1 — data layer)
--
-- Powers the public /planning-applications/* pages. Adds:
--   1. A real, auto-maintained postcode_district column (no request-time parsing).
--   2. A curated town gazetteer (comma-delimited councils only; extend by inserting).
--   3. seo_locations — the single source of "pages worth generating" (>= 5 apps).
--   4. Scoped anon-readable views so public pages can read data despite the base
--      table's RLS (which only lets a signed-in user see councils they track).
--
-- Nothing here touches the scraper, the n8n webhook, or existing auth/RLS policies.
--
-- Rollback:
--   drop view if exists public.public_applications;
--   drop view if exists public.seo_locations;
--   drop table if exists public.seo_towns;
--   drop index if exists public.idx_pa_postcode_district;
--   drop index if exists public.idx_pa_council_slug;
--   alter table public.planning_applications drop column if exists postcode_district;

-- 1) Postcode district (outward code), derived from the address once, stored, and
--    recomputed automatically by Postgres on every insert/update — so new scraped
--    rows get it with no application or scraper change. regexp_match is IMMUTABLE,
--    which a generated column requires.
alter table public.planning_applications
  add column if not exists postcode_district text
  generated always as (
    upper((regexp_match(address, '([A-Za-z]{1,2}[0-9][A-Za-z0-9]?)\s*[0-9][A-Za-z]{2}'))[1])
  ) stored;

create index if not exists idx_pa_postcode_district on public.planning_applications (postcode_district);
create index if not exists idx_pa_council_slug on public.planning_applications (council_slug);

-- 2) Curated town gazetteer. Town cannot be parsed reliably from free-text
--    addresses in general (London/Bristol addresses have no usable town), so towns
--    are an explicit allow-list, matched against comma-delimited address components.
--    Grow coverage by inserting rows — no code change needed.
create table if not exists public.seo_towns (
  council_slug text not null,
  slug         text not null,
  name         text not null,
  primary key (council_slug, slug)
);

insert into public.seo_towns (council_slug, slug, name) values
  ('staffordshire-moorlands', 'leek',       'Leek'),
  ('staffordshire-moorlands', 'cheadle',    'Cheadle'),
  ('staffordshire-moorlands', 'endon',      'Endon'),
  ('staffordshire-moorlands', 'cheddleton', 'Cheddleton')
on conflict do nothing;

-- 3) The location index. One row per page worth generating, with a live count.
--    The >= 5 threshold is baked in here so thin pages can never be generated.
create or replace view public.seo_locations as
  -- Council tier
  select
    'council'::text as tier,
    c.slug          as slug,
    null::text      as parent_slug,
    c.name          as name,
    count(pa.id)    as app_count
  from public.councils c
  join public.planning_applications pa on pa.council_slug = c.slug
  group by c.slug, c.name
  having count(pa.id) >= 5

  union all
  -- Postcode-district tier
  select
    'postcode'::text            as tier,
    lower(pa.postcode_district) as slug,
    null::text                  as parent_slug,
    pa.postcode_district        as name,
    count(pa.id)                as app_count
  from public.planning_applications pa
  where pa.postcode_district is not null
  group by pa.postcode_district
  having count(pa.id) >= 5

  union all
  -- Town tier (curated gazetteer; comma-delimited component match)
  select
    'town'::text   as tier,
    t.slug         as slug,
    t.council_slug as parent_slug,
    t.name         as name,
    count(pa.id)   as app_count
  from public.seo_towns t
  join public.planning_applications pa
    on pa.council_slug = t.council_slug
   and pa.address ilike '%, ' || t.name || ', %'
  group by t.slug, t.council_slug, t.name
  having count(pa.id) >= 5;

-- 4) Scoped public read of application rows — public-record columns only.
--    Deliberately excludes score / band / score_reasons / raw_data / state_hash.
--    Runs as its owner (security definer, the Postgres default), so it bypasses
--    the base table's RLS and returns rows to anonymous visitors.
create or replace view public.public_applications as
  select
    id, council_slug, reference, address, description, status,
    application_date, decision_date, postcode_district, created_at
  from public.planning_applications;

-- 5) Expose the public-facing views to the anon + authenticated PostgREST roles.
--    The base planning_applications table is NOT granted — anon still can't read it
--    directly, only these curated views.
grant select on public.seo_locations     to anon, authenticated;
grant select on public.seo_towns         to anon, authenticated;
grant select on public.public_applications to anon, authenticated;
