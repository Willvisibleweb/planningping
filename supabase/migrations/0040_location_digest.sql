-- 0040: make the location digest sendable, and unsubscribable.
--
-- The public location pages have carried an email capture since 0009, promising
-- "a free weekly email of new applications here, scored for civils scope —
-- unsubscribe anytime". Nothing has ever read that table, so nobody received
-- anything and there was nothing to unsubscribe from. This adds the two columns
-- the sender needs before it can honestly make that promise.
--
-- unsubscribed_at mirrors profiles.emails_unsubscribed_at from 0039: null means
-- subscribed, and every sender skips non-null rows. It is a timestamp rather
-- than a boolean so that "when did they opt out" is answerable, which is the
-- question that actually comes up.
--
-- last_sent_at is what stops a re-run resending the same week. The weekly job
-- is idempotent by period, but a subscriber added mid-week must not receive the
-- issue that went out before they existed.

alter table public.location_subscriptions
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists last_sent_at    timestamptz;

comment on column public.location_subscriptions.unsubscribed_at is
  'When this subscriber opted out; null = subscribed. Every sender must skip non-null rows.';
comment on column public.location_subscriptions.last_sent_at is
  'End of the last digest period sent to this row. Guards against resending a week.';

-- The weekly job selects live subscribers grouped by location, so that is the
-- access path worth an index. Partial: unsubscribed rows are kept for audit but
-- never selected for sending.
create index if not exists location_subscriptions_live_idx
  on public.location_subscriptions (location_type, location_slug)
  where unsubscribed_at is null;

-- Rollback:
-- drop index if exists public.location_subscriptions_live_idx;
-- alter table public.location_subscriptions
--   drop column if exists unsubscribed_at, drop column if exists last_sent_at;
