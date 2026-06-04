-- =============================================================================
-- PlanningPing Database Schema
-- Run this in the Supabase SQL editor to set up all tables and policies.
-- Every table has RLS enabled from creation — no exceptions.
-- =============================================================================

-- Enable the pgcrypto extension for gen_random_uuid() if not already active.
create extension if not exists pgcrypto;


-- =============================================================================
-- TABLE: profiles
-- One row per authenticated user. Created automatically via trigger when a
-- new user signs up in auth.users.
-- =============================================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  plan        text not null default 'free' check (plan in ('free', 'paid')),
  digest_day  text not null default 'monday' check (
                digest_day in ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')
              ),
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read and update only their own profile.
create policy "profiles: select own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid());

-- The trigger below handles insert — users cannot insert directly.
create policy "profiles: no direct insert"
  on public.profiles for insert
  with check (false);

-- Trigger: automatically create a profile row when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
-- security definer means this runs as the function owner (postgres), not the
-- calling user — needed because the trigger fires before the user's session
-- exists and they can't insert into profiles themselves.
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =============================================================================
-- TABLE: tracked_areas
-- Each row is a postcode/area a user has added to their watchlist.
-- council_slug identifies which Idox portal to scrape (e.g. 'westminster').
-- =============================================================================
create table public.tracked_areas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  label         text not null,                -- Human name, e.g. "Home", "Office"
  postcode      text not null,               -- Normalised, e.g. 'SW1A 1AA'
  council_slug  text not null,               -- Identifies the Idox portal
  radius_metres int not null default 1000,   -- Search radius around postcode
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table public.tracked_areas enable row level security;

create policy "tracked_areas: select own"
  on public.tracked_areas for select
  using (user_id = auth.uid());

create policy "tracked_areas: insert own"
  on public.tracked_areas for insert
  with check (user_id = auth.uid());

create policy "tracked_areas: update own"
  on public.tracked_areas for update
  using (user_id = auth.uid());

create policy "tracked_areas: delete own"
  on public.tracked_areas for delete
  using (user_id = auth.uid());


-- =============================================================================
-- TABLE: planning_applications
-- Scraped per council, not per user. One row per unique application.
-- This is the cost-efficiency cornerstone: if 50 users track the same council,
-- we store one row, not 50.
--
-- state_hash: SHA-256 of (status || decision_date). n8n compares this on each
-- scrape run — if it matches the stored hash, the application is skipped
-- entirely. Only genuine changes trigger processing.
-- =============================================================================
create table public.planning_applications (
  id               uuid primary key default gen_random_uuid(),
  council_slug     text not null,
  reference        text not null,            -- Council's own ref, e.g. '22/01234/FUL'
  address          text,
  description      text,
  status           text,                     -- 'Pending', 'Approved', 'Refused', etc.
  application_date date,
  decision_date    date,
  state_hash       text,                     -- Hash for change detection (see above)
  raw_data         jsonb,                    -- All other scraped fields
  last_scraped_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Prevent duplicate rows for the same application on the same council.
  unique (council_slug, reference)
);

alter table public.planning_applications enable row level security;

-- Users can read applications from councils they actively track.
-- Write access is service-role only (via n8n webhook) — no client can insert
-- or update these rows directly.
create policy "planning_applications: select if tracking council"
  on public.planning_applications for select
  using (
    exists (
      select 1
      from public.tracked_areas ta
      where ta.council_slug = planning_applications.council_slug
        and ta.user_id = auth.uid()
        and ta.is_active = true
    )
  );

-- Trigger: keep updated_at current on every update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger planning_applications_updated_at
  before update on public.planning_applications
  for each row execute function public.set_updated_at();


-- =============================================================================
-- TABLE: digests
-- Record of every email digest sent to a user.
-- Written by n8n (service role) after sending an email. Read-only for users.
-- =============================================================================
create table public.digests (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  sent_at             timestamptz not null default now(),
  period_start        date not null,
  period_end          date not null,
  application_count   int not null default 0,
  summary             text                 -- Short plain-text summary of the digest
);

alter table public.digests enable row level security;

create policy "digests: select own"
  on public.digests for select
  using (user_id = auth.uid());

-- n8n inserts via service role, which bypasses RLS. Users cannot insert.
create policy "digests: no direct insert"
  on public.digests for insert
  with check (false);


-- =============================================================================
-- INDEXES
-- Added for query patterns that will be hot paths:
-- - Looking up applications by council (used in RLS policy and dashboard)
-- - Looking up tracked areas by user (used everywhere)
-- - Looking up digests by user ordered by date
-- =============================================================================
create index idx_planning_applications_council_slug
  on public.planning_applications (council_slug);

create index idx_tracked_areas_user_id
  on public.tracked_areas (user_id);

create index idx_tracked_areas_council_slug
  on public.tracked_areas (council_slug);

create index idx_digests_user_id_sent_at
  on public.digests (user_id, sent_at desc);
