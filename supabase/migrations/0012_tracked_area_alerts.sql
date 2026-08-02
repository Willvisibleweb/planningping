-- 0012: Per-territory relevance filtering + email alert opt-in, plus the
-- send-log table that backs alert dedup.
--
-- min_band reuses the existing civils scoring engine (lib/scoring) as a
-- filter — 'WARM_PLUS'/'HOT_ONLY' hide COLD-band noise (e.g. conservatory
-- extensions, already keyword-excluded by civilsCriteria.ts) from both the
-- dashboard/territory display AND the alert fan-out below. One stored value,
-- two consumers.
--
-- alerts_enabled gates a NEW capability: a batched email sent once per daily
-- ingest run, listing genuinely new applications that clear the area's
-- min_band. Professional-tier only (enforced server-side, not by RLS).
--
-- email_alert_log is insert-only from the service role (the ingest cron) —
-- same pattern as digests/location_subscriptions. Its unique index is what
-- makes the alert fan-out idempotent across retried/overlapping runs.
--
-- Rollback:
--   drop table if exists public.email_alert_log;
--   alter table public.tracked_areas drop column if exists alerts_enabled;
--   alter table public.tracked_areas drop column if exists min_band;

alter table public.tracked_areas
  add column if not exists min_band text not null default 'ALL'
    check (min_band in ('ALL','WARM_PLUS','HOT_ONLY'));

alter table public.tracked_areas
  add column if not exists alerts_enabled boolean not null default false;

create table if not exists public.email_alert_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  tracked_area_id uuid not null references public.tracked_areas(id) on delete cascade,
  council_slug    text not null,
  reference       text not null,
  sent_at         timestamptz not null default now()
);

alter table public.email_alert_log enable row level security;

create policy "email_alert_log: select own" on public.email_alert_log
  for select using (user_id = auth.uid());
-- No insert policy for authenticated/anon — service role (cron) only.

create unique index if not exists idx_email_alert_log_dedup
  on public.email_alert_log (tracked_area_id, council_slug, reference);

create index if not exists idx_email_alert_log_user_sent
  on public.email_alert_log (user_id, sent_at desc);
