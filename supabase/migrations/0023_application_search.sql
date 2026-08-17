-- Full-text search over planning application descriptions.
--
-- The territory page filtered the 200 applications it had already fetched, in
-- the browser, with a substring match. Two things were wrong with that:
--
--   1. Westminster holds 742 applications. 542 of them could not be found at
--      all, because the search never saw them, and nothing on screen said so.
--   2. Substring matching is literal, so typing "houses" does not match a
--      description reading "house" — the first thing a user tries.
--
-- Postgres full-text fixes 2 for free: the english config stems "houses",
-- "housing" and "house" to one root. Synonyms stemming cannot reach ("dwelling"
-- for "house") are expanded in application code, where the vocabulary can be
-- edited without a migration — see lib/search/vocabulary.
--
-- Description only, deliberately. An earlier draft of this migration also
-- indexed the address, weighted below the description. Measured against the
-- live corpus that was a disaster: the synonym group behind "highways" matched
-- 1238 of 3050 applications — 41% of everything — because "Road" appears in
-- most addresses and stemming collapses road/roads into one lexeme. Restricted
-- to descriptions the same search returns 325. Synonyms describe what is being
-- built, so they belong to the description; addresses are matched literally in
-- the query layer instead, where "Mill Lane" means Mill Lane and nothing else.
--
-- Reference numbers are excluded for the same reason: to_tsvector shreds
-- "26/04665/NMA" into meaningless fragments, so pasting a reference is served
-- by exact matching in the query layer.

alter table public.planning_applications
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('english', coalesce(description, ''))) stored;

-- GIN is the right index for tsvector containment (@@). At 3k rows a sequential
-- scan would be fine; this table covers 26 of ~410 available authorities, so it
-- is going to grow by more than an order of magnitude, and adding an index to a
-- small table is a far better day than retro-fitting one to a large table.
create index if not exists planning_applications_search_idx
  on public.planning_applications using gin (search_vector);

-- No RLS change. Search reads planning_applications, whose existing SELECT
-- policy already restricts a user to councils they actively track; a generated
-- column inherits that policy rather than bypassing it.

comment on column public.planning_applications.search_vector is
  'Generated tsvector of description. Maintained by Postgres; never written directly. Address and reference are deliberately excluded and matched literally instead — see 0023.';
