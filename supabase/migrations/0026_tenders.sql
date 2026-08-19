-- Public sector tenders from Contracts Finder.
--
-- A second opportunity signal alongside planning. Planning says something will
-- be built; a tender says someone is buying the work, with a budget and a
-- deadline attached — and carries the one field planning data never has, a
-- contract value.
--
-- Deliberately NOT scoped to territories, and that is a measurement rather than
-- a preference. Contracts Finder publishes roughly 19 tenders a day nationally;
-- 49% carry a delivery postcode and 39% are construction-related, so about four
-- or five a day UK-wide are usable here. Scoped to one user's postcode radius
-- that is roughly one a year, and a "tenders near you" feed would have rendered
-- empty for every user, permanently. Scoped by discipline nationally it is four
-- or five real leads a day, which a firm will travel for at £500k in a way they
-- will not at £20k.
--
-- So this table is global: one row per tender, the same rows for everyone, no
-- user_id. That shapes the RLS below.

create table if not exists public.tenders (
  -- The OCDS release id. Stable across republication, which makes it the
  -- natural key — Contracts Finder reissues notices as they are amended, and
  -- keying on anything else would accumulate duplicates of the same contract.
  ocid text primary key,
  title text not null,
  description text,
  buyer text,
  -- GBP only. A figure in another currency compared against a pound threshold
  -- is worse than no figure, so non-GBP amounts are discarded at ingest rather
  -- than stored in a column that implies pounds.
  value_gbp numeric,
  classification text,
  postcode text,
  -- Outward code ("ST13" from "ST13 5RS"). Stored rather than derived per query
  -- so it can be indexed — this is what any future geographic grouping keys on.
  outward_code text,
  published_at date,
  closes_at date,
  url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Closing soonest is the default view: a tender you cannot bid for by Friday is
-- not an opportunity. Partial, because a notice with no deadline cannot appear
-- in that view at all and there is no point indexing it for one.
create index if not exists tenders_closes_at_idx
  on public.tenders (closes_at) where closes_at is not null;

create index if not exists tenders_published_at_idx
  on public.tenders (published_at desc nulls last);

create index if not exists tenders_value_idx
  on public.tenders (value_gbp desc nulls last);

alter table public.tenders enable row level security;

-- Readable by any signed-in account. This is public procurement data — it is
-- published openly by the government, and there is nothing here to scope to an
-- owner. Signed-in rather than anon so it stays a reason to have an account.
drop policy if exists "tenders: read for signed-in users" on public.tenders;
create policy "tenders: read for signed-in users"
  on public.tenders for select
  to authenticated
  using (true);

-- No insert, update or delete policy, on purpose. With RLS on and no policy for
-- a command, that command is denied — so only the service role (which bypasses
-- RLS) can write, which is exactly the ingest and nothing else.

-- Grants revoked explicitly rather than trusted to defaults. Migration 0024
-- found anon and authenticated holding INSERT, UPDATE, DELETE and TRUNCATE on
-- every existing table in this schema, which is how a table nobody thought was
-- writable turned out to be. A new table gets the same treatment up front
-- rather than being discovered later.
revoke insert, update, delete, truncate, references, trigger
  on public.tenders from anon, authenticated;

comment on table public.tenders is
  'Construction-related tenders from Contracts Finder. Global, not per-user: national volume is ~4-5 usable notices a day, far too thin to scope to a territory (see 0026). Written only by the service role; readable by any signed-in account.';
