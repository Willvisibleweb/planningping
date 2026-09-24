-- 0039: One-click unsubscribe from all customer email.
--
-- Null = subscribed. A timestamp = unsubscribed at that moment, which doubles
-- as the record of when they asked, should anyone ever need to show it.
--
-- One switch for every customer email (alerts, discharge alerts, decisions,
-- weekly digest) rather than per-type preferences: the link in the email says
-- "unsubscribe", and anything less than stopping all of them would not be what
-- the reader clicked. Per-type controls can be layered on later without
-- changing what this column means.
--
-- Writes go through the service-role client only — from /api/unsubscribe (a
-- signed link, no session) and the settings action (session verified first).
-- 0006 revoked UPDATE on profiles from authenticated and granted back only
-- digest_day, so this column is not user-writable through PostgREST, and no
-- grant is added here.
--
-- Rollback:
--   alter table public.profiles drop column if exists emails_unsubscribed_at;

alter table public.profiles
  add column if not exists emails_unsubscribed_at timestamptz;

comment on column public.profiles.emails_unsubscribed_at is
  'When the user unsubscribed from all customer email; null = subscribed. Every sender must skip non-null rows.';
