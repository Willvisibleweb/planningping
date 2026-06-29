-- =============================================================================
-- Migration: coverage_requests — capture demand when a user tries to track an
-- area we don't cover yet, instead of silently failing.
-- Run in the Supabase SQL editor (project vinwnykuumifpctdjxbu).
--
-- When someone enters a postcode whose council isn't supported, we log it here.
-- That turns a dead-end into a waitlist + a prioritised list of which councils
-- to add next (query: most-requested unsupported councils).
-- =============================================================================

create table public.coverage_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles(id) on delete set null,
  postcode      text not null,
  council_slug  text,                 -- resolved council (may be unsupported or unknown)
  created_at    timestamptz not null default now()
);

alter table public.coverage_requests enable row level security;

-- Users can log their own requests and see them back. The founder reads all of
-- them via the service role (which bypasses RLS) for the waitlist/demand view.
create policy "coverage_requests: insert own"
  on public.coverage_requests for insert
  with check (user_id = auth.uid());

create policy "coverage_requests: select own"
  on public.coverage_requests for select
  using (user_id = auth.uid());

create index idx_coverage_requests_council on public.coverage_requests (council_slug);
