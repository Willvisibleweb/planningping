-- 0015: Discharge-of-condition classification, parent-application linkage,
-- and staleness flagging on planning_applications, plus discharge_alert_log
-- (dedup/audit trail for the new tracked-lead-based notification axis).
--
-- Additive only — five nullable/defaulted columns on planning_applications,
-- one new table. Nothing existing is altered or dropped.
--
-- application_type is a free-text enum-via-CHECK (not boolean) so Phase 2
-- can add more values later without touching this column's shape. NULL
-- passes the CHECK by design (Postgres CHECK constraints permit NULL) —
-- most rows will never be classified.
--
-- parent_application_reference (raw parsed text) and parent_application_id
-- (resolved FK) are deliberately separate: raw text is stored whenever
-- parseable regardless of match success, since formats vary wildly across
-- councils; the FK is populated only once a real row is found, scoped to
-- the SAME council (a discharge application is always submitted to the same
-- LPA as its parent permission).
--
-- is_stale is flipped both ways by the daily sweep (cleared automatically
-- once a decision_date lands) — not a one-way flag.
--
-- discharge_alert_log is per-tracked-lead, not per-tracked-area (unlike
-- email_alert_log from 0012) — a user can be tracking a lead in a council
-- they've since stopped tracking as an area, so email_alert_log's
-- tracked_area_id-based dedup key doesn't fit this trigger axis.
--
-- NOT APPLIED TO PRODUCTION — written for manual review only. Do not run
-- via apply_migration until reviewed.
--
-- Rollback:
--   drop table if exists public.discharge_alert_log;
--   drop index if exists public.idx_planning_applications_is_stale;
--   drop index if exists public.idx_planning_applications_parent_application_id;
--   drop index if exists public.idx_planning_applications_application_type;
--   alter table public.planning_applications drop constraint if exists planning_applications_application_type_check;
--   alter table public.planning_applications drop column if exists is_stale;
--   alter table public.planning_applications drop column if exists parent_reference_needs_review;
--   alter table public.planning_applications drop column if exists parent_application_id;
--   alter table public.planning_applications drop column if exists parent_application_reference;
--   alter table public.planning_applications drop column if exists application_type;

alter table public.planning_applications
  add column if not exists application_type text,
  add column if not exists parent_application_reference text,
  add column if not exists parent_application_id uuid references public.planning_applications(id) on delete set null,
  add column if not exists parent_reference_needs_review boolean not null default false,
  add column if not exists is_stale boolean not null default false;

alter table public.planning_applications
  add constraint planning_applications_application_type_check
  check (application_type in ('discharge_of_condition'));

create index if not exists idx_planning_applications_application_type
  on public.planning_applications (application_type) where application_type is not null;

create index if not exists idx_planning_applications_parent_application_id
  on public.planning_applications (parent_application_id) where parent_application_id is not null;

create index if not exists idx_planning_applications_is_stale
  on public.planning_applications (is_stale) where is_stale = true;

-- No RLS changes on planning_applications — the existing council-membership
-- select policy already covers every column on the row, including these.

create table public.discharge_alert_log (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.profiles(id) on delete cascade,
  tracked_lead_id           uuid not null references public.tracked_leads(id) on delete cascade,
  discharge_application_id  uuid not null references public.planning_applications(id) on delete cascade,
  kind                      text not null check (kind in ('new_match', 'stale')),
  sent_at                   timestamptz not null default now()
);

alter table public.discharge_alert_log enable row level security;

create policy "discharge_alert_log: select own" on public.discharge_alert_log
  for select using (user_id = auth.uid());
-- No insert policy for authenticated/anon — service role (cron) only,
-- same pattern as email_alert_log (0012).

create unique index if not exists idx_discharge_alert_log_dedup
  on public.discharge_alert_log (tracked_lead_id, discharge_application_id, kind);

create index if not exists idx_discharge_alert_log_user_sent
  on public.discharge_alert_log (user_id, sent_at desc);
