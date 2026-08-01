-- 0009: Email capture for the public location pages.
--
-- Visitors to /planning-applications/* can subscribe to alerts for a place.
-- Rows are written ONLY by the /api/alerts/subscribe route via the service-role
-- admin client, so RLS is enabled with NO anon/authenticated policies — the
-- table is not directly readable or writable by the public PostgREST roles.
--
-- `confirmed` defaults false to leave room for a double-opt-in email step later.
--
-- Rollback:
--   drop table if exists public.location_subscriptions;

create table if not exists public.location_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  location_slug text not null,
  location_type text not null check (location_type in ('council','postcode','town')),
  created_at    timestamptz not null default now(),
  confirmed     boolean not null default false
);

-- One subscription per (email, place). Case-insensitive on email so
-- Foo@x.com and foo@x.com don't both subscribe.
create unique index if not exists idx_location_subs_unique
  on public.location_subscriptions (lower(email), location_slug, location_type);

alter table public.location_subscriptions enable row level security;
-- Intentionally no policies: service-role writes only.
