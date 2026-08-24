-- Per-authority centroid and count, for the national coverage map.
--
-- A view rather than aggregation in application code, because the client caps a
-- result set at 1000 rows. Averaging coordinates over "whatever the first
-- thousand rows happened to be" produced centroids that were quietly wrong —
-- Westminster came out at 50.71 and Southwark at 48.00, which is in France —
-- while still looking like plausible numbers. Aggregating in SQL removes both
-- the cap and the class of bug.
--
-- Only authorities with at least five located applications appear. A pin
-- standing for two rows is noise on a national view and overstates how well
-- that area is covered.

create or replace view public.coverage_points as
select
  c.name,
  pa.council_slug as slug,
  count(*) as application_count,
  round(avg((pa.raw_data->>'lat')::numeric), 4) as lat,
  round(avg((pa.raw_data->>'lng')::numeric), 4) as lng
from public.planning_applications pa
join public.councils c on c.slug = pa.council_slug
where pa.raw_data->>'lat' is not null
  and pa.raw_data->>'lng' is not null
  -- Bounds check rather than trust. Every stored coordinate is inside the UK
  -- today, but one bad row would drag an authority's centroid into the sea and
  -- nothing else would notice.
  and (pa.raw_data->>'lat')::numeric between 49.5 and 61
  and (pa.raw_data->>'lng')::numeric between -9 and 2
group by c.name, pa.council_slug
having count(*) >= 5;

-- Aggregate counts of data already public through the SEO pages; no row-level
-- detail and nothing user-specific. Readable by anyone, writable by no one —
-- a view over an aggregate is not updatable, and the grants say so anyway.
revoke insert, update, delete, truncate, references, trigger
  on public.coverage_points from anon, authenticated;

comment on view public.coverage_points is
  'Per-authority application count and centroid for the public coverage map. Aggregated in SQL because the client row cap silently corrupted centroids computed in application code — see 0028.';
