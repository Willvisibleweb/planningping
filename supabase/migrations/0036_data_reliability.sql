-- 0036: Data reliability — provenance, change history, run logging, duplicate
-- review and benchmarking.
--
-- Why: PlanningPing is about to be compared record-for-record against another
-- planning data source. Before this migration there was no way to say when an
-- application was last confirmed against its source (last_scraped_at only
-- moves when a status changes, so 96% of rows looked a week or more old), no
-- record of what a council changed, no log of which source runs succeeded or
-- failed, and no place to store a benchmark result. Every table here is
-- additive; nothing existing is renamed or dropped.
--
-- Written only by the service role (cron routes and server actions). The one
-- table users can read is application_changes, and only for applications the
-- existing planning_applications policy already lets them see.

-- ---------------------------------------------------------------------------
-- 1. Provenance on planning_applications
-- ---------------------------------------------------------------------------
-- Kept to small scalar columns on purpose: six pages select('*') from this
-- table, so the full raw source record lives in its own table (section 3)
-- rather than being dragged into every list query.

alter table public.planning_applications
  add column if not exists source_type               text,
  add column if not exists source_record_id          text,
  add column if not exists source_url                text,
  add column if not exists source_last_changed_at    timestamptz,
  add column if not exists last_seen_at              timestamptz,
  add column if not exists content_hash              text,
  add column if not exists scored_at                 timestamptz,
  add column if not exists scoring_version           text,
  add column if not exists ai_summary_model          text,
  add column if not exists ai_summary_prompt_version text;

comment on column public.planning_applications.source_type is
  'Where the record came from: planit (PlanIt API) or legacy_scrape (the retired Idox/n8n scraper, which stored no source link).';
comment on column public.planning_applications.source_record_id is
  'The source''s own identifier for the record (PlanIt "name", e.g. Rutland/2026/1126/FUL).';
comment on column public.planning_applications.source_url is
  'Link to the authority''s own record for this application. Mirrors raw_data->>url, promoted so it can be indexed and audited.';
comment on column public.planning_applications.source_last_changed_at is
  'When the source last saw this record''s content change (PlanIt last_different).';
comment on column public.planning_applications.last_seen_at is
  'Last time this application appeared in a successful source response. Unlike last_scraped_at, moves even when nothing changed.';
comment on column public.planning_applications.content_hash is
  'SHA-256 over every stored source fact (see lib/reliability/sourceChanges.ts). Differs from state_hash, which covers status and decision date only.';
comment on column public.planning_applications.created_at is
  'First time PlanningPing saw this application (first seen).';
comment on column public.planning_applications.last_scraped_at is
  'Last time the ingest wrote changed source values to this row.';

-- Backfill from what raw_data already holds. Legacy rows keep a null link:
-- inventing one would be exactly the kind of false provenance this is for.
update public.planning_applications
   set source_type  = case when raw_data->>'source' = 'planit' then 'planit' else 'legacy_scrape' end,
       source_url   = nullif(btrim(raw_data->>'url'), ''),
       last_seen_at = last_scraped_at
 where source_type is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'planning_applications_source_type_check') then
    alter table public.planning_applications
      add constraint planning_applications_source_type_check
      check (source_type is null or source_type in ('planit', 'legacy_scrape', 'manual'));
  end if;
end $$;

create index if not exists idx_pa_last_seen_at on public.planning_applications (last_seen_at);
create index if not exists idx_pa_source_url on public.planning_applications (source_url) where source_url is not null;
create index if not exists idx_pa_council_application_date on public.planning_applications (council_slug, application_date);

-- ---------------------------------------------------------------------------
-- 2. Councils: aliases and success stamps
-- ---------------------------------------------------------------------------
-- Bristol exists twice: 'bristol-city-of' (holds all 628 applications and the
-- tracked areas) and 'bristol', created by the national backfill slugifying
-- the same PlanIt name. Two ingest paths slugify directly, so the first Bristol
-- territory added through them would have written a second copy of every
-- application under 'bristol'. canonical_slug lets the resolver redirect.
--
-- last_planit_success_at is separate from last_planit_fetch_at because the
-- backfill stamps the latter on failure too (to keep its rotation moving), and
-- the add-territory path reads it as "fresh data exists" — so a failed fetch
-- suppressed the next real one for two hours.

alter table public.councils
  add column if not exists canonical_slug         text,
  add column if not exists last_planit_success_at timestamptz;

comment on column public.councils.canonical_slug is
  'When set, this row is an alias: applications for it are stored under canonical_slug.';

update public.councils
   set canonical_slug = 'bristol-city-of',
       supported      = false
 where slug = 'bristol'
   and canonical_slug is null
   and exists (select 1 from public.councils where slug = 'bristol-city-of');

-- ---------------------------------------------------------------------------
-- 3. Latest raw source record per application
-- ---------------------------------------------------------------------------

create table if not exists public.application_source_snapshots (
  application_id    uuid primary key references public.planning_applications(id) on delete cascade,
  source_type       text not null,
  source_record_id  text,
  payload           jsonb not null,
  payload_hash      text not null,
  first_captured_at timestamptz not null default now(),
  captured_at       timestamptz not null default now()
);

comment on table public.application_source_snapshots is
  'The most recent raw record received from the source, verbatim, rewritten only when the record''s content changes. Internal: service role only.';

-- ---------------------------------------------------------------------------
-- 4. Change history
-- ---------------------------------------------------------------------------

create table if not exists public.application_changes (
  id             bigint generated always as identity primary key,
  application_id uuid not null references public.planning_applications(id) on delete cascade,
  field          text not null check (field in (
                   'status', 'decision_date', 'description', 'address', 'agent_company',
                   'target_decision_date', 'application_date', 'app_type', 'source_url')),
  old_value      text,
  new_value      text,
  detected_at    timestamptz not null default now(),
  source_type    text,
  run_id         uuid
);

comment on table public.application_changes is
  'One row per source field that changed between two readings of an application. Written by the ingest; null-to-value on late-added columns is backfill and is not recorded.';

create index if not exists application_changes_application_idx on public.application_changes (application_id, detected_at desc);
create index if not exists application_changes_detected_idx on public.application_changes (detected_at desc);

-- ---------------------------------------------------------------------------
-- 5. Pipeline runs, source runs and events
-- ---------------------------------------------------------------------------

create table if not exists public.pipeline_runs (
  id          uuid primary key default gen_random_uuid(),
  job         text not null,
  trigger     text not null default 'cron' check (trigger in ('cron', 'manual', 'user_action', 'webhook')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  summary     jsonb
);

comment on table public.pipeline_runs is
  'One row per job invocation. A row left at status running long after started_at means the function was killed before it could finish.';

create index if not exists pipeline_runs_job_started_idx on public.pipeline_runs (job, started_at desc);

create table if not exists public.source_runs (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid references public.pipeline_runs(id) on delete set null,
  job             text not null,
  source_type     text not null default 'planit',
  source_key      text not null,
  source_label    text,
  council_slug    text,
  started_at      timestamptz not null,
  finished_at     timestamptz,
  duration_ms     int,
  status          text not null check (status in ('success', 'partial', 'failed', 'skipped')),
  http_status     int,
  attempts        int not null default 1,
  window_start    date,
  window_end      date,
  window_days     int,
  records_returned int,
  source_total    int,
  truncated       boolean not null default false,
  changed_records int,
  new_count       int,
  updated_count   int,
  unchanged_count int,
  error_stage     text,
  error_message   text,
  recovered       boolean
);

comment on table public.source_runs is
  'One row per source query. source_key is the stable identity health baselines are computed over (e.g. planit:area:ST10 4AJ@5).';

create index if not exists source_runs_key_started_idx on public.source_runs (source_key, started_at desc);
create index if not exists source_runs_started_idx on public.source_runs (started_at desc);
create index if not exists source_runs_run_idx on public.source_runs (run_id);

create table if not exists public.pipeline_events (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  run_id       uuid references public.pipeline_runs(id) on delete set null,
  job          text not null,
  stage        text not null,
  severity     text not null check (severity in ('info', 'warning', 'error', 'critical')),
  source_key   text,
  council_slug text,
  message      text not null,
  detail       jsonb,
  retry_count  int not null default 0,
  recovered    boolean
);

comment on table public.pipeline_events is
  'Structured audit trail of pipeline problems. Messages are sanitised before insert (lib/reliability/sanitise.ts); no stack traces or credentials.';

create index if not exists pipeline_events_occurred_idx on public.pipeline_events (occurred_at desc);
create index if not exists pipeline_events_severity_idx on public.pipeline_events (severity, occurred_at desc);

-- ---------------------------------------------------------------------------
-- 6. Duplicate candidates
-- ---------------------------------------------------------------------------

create table if not exists public.duplicate_candidates (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.planning_applications(id) on delete cascade,
  candidate_id   uuid not null references public.planning_applications(id) on delete cascade,
  match_type     text not null,
  confidence     text not null check (confidence in ('high', 'medium', 'low')),
  evidence       jsonb,
  status         text not null default 'open' check (status in ('open', 'confirmed_duplicate', 'not_duplicate')),
  detected_at    timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    text,
  constraint duplicate_candidates_ordered check (application_id < candidate_id),
  constraint duplicate_candidates_pair_unique unique (application_id, candidate_id)
);

comment on table public.duplicate_candidates is
  'Possible duplicates flagged for human review. Nothing is merged or deleted automatically.';

create index if not exists duplicate_candidates_status_idx on public.duplicate_candidates (status, detected_at desc);
create index if not exists duplicate_candidates_candidate_idx on public.duplicate_candidates (candidate_id);

-- ---------------------------------------------------------------------------
-- 7. Benchmarking
-- ---------------------------------------------------------------------------

create table if not exists public.benchmark_sets (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  description     text,
  external_source text,
  created_at      timestamptz not null default now()
);

create table if not exists public.benchmark_items (
  id                      uuid primary key default gen_random_uuid(),
  set_id                  uuid not null references public.benchmark_sets(id) on delete cascade,
  external_id             text,
  authority_name          text not null,
  council_slug            text,
  reference               text not null,
  address                 text,
  applicant               text,
  description             text,
  status                  text,
  source_url              text,
  external_published_date date,
  matched_application_id  uuid references public.planning_applications(id) on delete set null,
  found                   boolean,
  reference_verdict       text check (reference_verdict   in ('correct', 'incorrect', 'missing', 'not_applicable', 'needs_review')),
  address_verdict         text check (address_verdict     in ('correct', 'incorrect', 'missing', 'not_applicable', 'needs_review')),
  applicant_verdict       text check (applicant_verdict   in ('correct', 'incorrect', 'missing', 'not_applicable', 'needs_review')),
  description_verdict     text check (description_verdict in ('correct', 'incorrect', 'missing', 'not_applicable', 'needs_review')),
  status_verdict          text check (status_verdict      in ('correct', 'incorrect', 'missing', 'not_applicable', 'needs_review')),
  source_url_verdict      text check (source_url_verdict  in ('correct', 'incorrect', 'missing', 'not_applicable', 'needs_review')),
  duplicate_count         int check (duplicate_count is null or duplicate_count >= 0),
  ai_claims_checked       int check (ai_claims_checked is null or ai_claims_checked >= 0),
  ai_unsupported_claims   int check (ai_unsupported_claims is null or ai_unsupported_claims >= 0),
  classification_verdict  text check (classification_verdict in ('reasonable', 'unreasonable', 'needs_review')),
  detected_at             timestamptz,
  detection_delay_days    numeric,
  review_method           text check (review_method in ('auto', 'human')),
  notes                   text,
  reviewed_at             timestamptz,
  created_at              timestamptz not null default now(),
  constraint benchmark_items_unique unique (set_id, authority_name, reference)
);

comment on table public.benchmark_items is
  'One external record per row and our verdict on each field. Metrics are computed only from these rows — see lib/reliability/benchmark.ts.';

create index if not exists benchmark_items_set_idx on public.benchmark_items (set_id);

-- ---------------------------------------------------------------------------
-- 8. Access: service role only, except change history
-- ---------------------------------------------------------------------------

alter table public.application_source_snapshots enable row level security;
alter table public.application_changes          enable row level security;
alter table public.pipeline_runs                enable row level security;
alter table public.source_runs                  enable row level security;
alter table public.pipeline_events              enable row level security;
alter table public.duplicate_candidates         enable row level security;
alter table public.benchmark_sets               enable row level security;
alter table public.benchmark_items              enable row level security;

revoke all on public.application_source_snapshots from anon, authenticated;
revoke all on public.application_changes          from anon, authenticated;
revoke all on public.pipeline_runs                from anon, authenticated;
revoke all on public.source_runs                  from anon, authenticated;
revoke all on public.pipeline_events              from anon, authenticated;
revoke all on public.duplicate_candidates         from anon, authenticated;
revoke all on public.benchmark_sets               from anon, authenticated;
revoke all on public.benchmark_items              from anon, authenticated;

grant select on public.application_changes to authenticated;

drop policy if exists "application_changes: select if application visible" on public.application_changes;
create policy "application_changes: select if application visible" on public.application_changes
  for select to authenticated
  using (
    exists (
      select 1 from public.planning_applications pa
      where pa.id = application_changes.application_id
    )
  );

-- ---------------------------------------------------------------------------
-- 9. Aggregates for the admin reliability page
-- ---------------------------------------------------------------------------
-- Counted in the database so the page never pulls the table into Node.

create or replace function public.reliability_overview()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'applications_total',        (select count(*) from public.planning_applications),
    'seen_last_24h',             (select count(*) from public.planning_applications where last_seen_at >= now() - interval '24 hours'),
    'written_today',             (select count(*) from public.planning_applications where last_scraped_at >= date_trunc('day', now())),
    'new_today',                 (select count(*) from public.planning_applications where created_at >= date_trunc('day', now())),
    'not_seen_14d',              (select count(*) from public.planning_applications where last_seen_at is null or last_seen_at < now() - interval '14 days'),
    'missing_source_url',        (select count(*) from public.planning_applications where source_url is null),
    'missing_status',            (select count(*) from public.planning_applications where status is null or btrim(status) = ''),
    'missing_description',       (select count(*) from public.planning_applications where description is null or length(btrim(description)) < 15),
    'missing_address',           (select count(*) from public.planning_applications where address is null or length(btrim(address)) < 8),
    'missing_application_date',  (select count(*) from public.planning_applications where application_date is null),
    'missing_location',          (select count(*) from public.planning_applications where raw_data->>'lat' is null),
    'legacy_source',             (select count(*) from public.planning_applications where source_type = 'legacy_scrape'),
    'open_duplicate_candidates', (select count(*) from public.duplicate_candidates where status = 'open'),
    'changes_last_7d',           (select count(*) from public.application_changes where detected_at >= now() - interval '7 days'),
    'status_changes_last_7d',    (select count(*) from public.application_changes where field = 'status' and detected_at >= now() - interval '7 days')
  );
$$;

revoke execute on function public.reliability_overview() from public, anon, authenticated;
grant execute on function public.reliability_overview() to service_role;

-- Rollback:
-- drop function if exists public.reliability_overview();
-- drop table if exists public.benchmark_items, public.benchmark_sets, public.duplicate_candidates,
--   public.pipeline_events, public.source_runs, public.pipeline_runs, public.application_changes,
--   public.application_source_snapshots;
-- alter table public.councils drop column if exists canonical_slug, drop column if exists last_planit_success_at;
-- update public.councils set supported = true where slug = 'bristol';
-- alter table public.planning_applications drop constraint if exists planning_applications_source_type_check;
-- alter table public.planning_applications drop column if exists source_type, drop column if exists source_record_id,
--   drop column if exists source_url, drop column if exists source_last_changed_at, drop column if exists last_seen_at,
--   drop column if exists content_hash, drop column if exists scored_at, drop column if exists scoring_version,
--   drop column if exists ai_summary_model, drop column if exists ai_summary_prompt_version;
