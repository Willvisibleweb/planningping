-- =============================================================================
-- Migration: add tracked_leads — the "Vertical CRM" layer for civil engineers.
-- Run this in the Supabase SQL editor (project vinwnykuumifpctdjxbu).
--
-- A tracked_lead is a planning application a user has chosen to pursue through a
-- sales pipeline. It is PER-USER (unlike planning_applications, which is shared
-- per-council). We denormalise council_slug + reference + cached_status onto the
-- row so that:
--   1. the background sync (webhook) can flag changed leads by (council_slug,
--      reference) without a join, and
--   2. the lead survives even if the user later stops tracking that council.
-- application_id keeps a live link to the underlying application for display.
--
-- Isolated and additive — does not touch the scraper, scoring, or alert flow.
-- Rollback block at the bottom.
-- =============================================================================

create table public.tracked_leads (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  application_id     uuid not null references public.planning_applications(id) on delete cascade,

  -- Denormalised at insert time (see header for why). description/address are
  -- copied so the pipeline view and outreach generation work standalone, even
  -- if the user later stops tracking the council the application belongs to.
  council_slug       text not null,
  reference          text not null,
  description        text,
  address            text,
  cached_status      text,                       -- last-seen status, updated by sync

  pipeline_stage     text not null default 'Identified' check (
                       pipeline_stage in ('Identified','Contacted','Negotiating','Won','Lost')
                     ),
  last_contacted_at  timestamptz,
  next_follow_up_at  timestamptz,
  priority_follow_up boolean not null default false,  -- set true when status changes
  notes              text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- A user tracks any given application at most once.
  unique (user_id, application_id)
);

alter table public.tracked_leads enable row level security;

-- Per-user access only — mirrors the tracked_areas policy model.
create policy "tracked_leads: select own"
  on public.tracked_leads for select
  using (user_id = auth.uid());

create policy "tracked_leads: insert own"
  on public.tracked_leads for insert
  with check (user_id = auth.uid());

create policy "tracked_leads: update own"
  on public.tracked_leads for update
  using (user_id = auth.uid());

create policy "tracked_leads: delete own"
  on public.tracked_leads for delete
  using (user_id = auth.uid());

-- Keep updated_at current (reuses the existing set_updated_at function).
create trigger tracked_leads_updated_at
  before update on public.tracked_leads
  for each row execute function public.set_updated_at();

-- Hot paths: list a user's leads; sync lookup by (council_slug, reference).
create index idx_tracked_leads_user_id
  on public.tracked_leads (user_id);

create index idx_tracked_leads_council_reference
  on public.tracked_leads (council_slug, reference);

-- -----------------------------------------------------------------------------
-- ROLLBACK (paste into SQL editor if you kill the CRM direction):
-- -----------------------------------------------------------------------------
-- drop table if exists public.tracked_leads;
