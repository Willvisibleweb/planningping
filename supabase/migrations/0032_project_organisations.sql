-- 0032: shared project organisations and public-contact-ready records.
--
-- Planning applications are global source data. This adds the organisations
-- genuinely named on those records without turning them into user-owned CRM
-- contacts. Personal notes, pipeline state and activity remain in tracked_leads
-- and lead_events under their existing RLS policies.

create table if not exists public.organisations (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  normalized_name      text not null unique,
  website              text,
  office_location      text,
  telephone            text,
  public_email         text,
  company_profile_url  text,
  verification_status  text not null default 'source_record'
    check (verification_status in ('source_record', 'public_business', 'verified', 'unverified')),
  source_label         text,
  last_checked_at      timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (length(trim(name)) > 0)
);

comment on table public.organisations is
  'Global organisations named in public project sources. This is not a user CRM table.';
comment on column public.organisations.normalized_name is
  'Lower-cased, whitespace-normalised dedupe key. Populate alongside name in future enrichment writes.';
comment on column public.organisations.verification_status is
  'Provenance of the organisation record or contact field. Never imply a public record is verified enrichment.';

create trigger organisations_updated_at
  before update on public.organisations
  for each row execute function public.set_updated_at();

create table if not exists public.project_organisations (
  id                   uuid primary key default gen_random_uuid(),
  application_id       uuid not null references public.planning_applications(id) on delete cascade,
  organisation_id      uuid not null references public.organisations(id) on delete cascade,
  role                 text not null check (role in (
                         'developer_client', 'applicant', 'landowner',
                         'planning_agent', 'architect', 'planning_consultant',
                         'civil_engineer', 'structural_engineer', 'drainage_consultant',
                         'transport_consultant', 'landscape_architect',
                         'main_contractor', 'other'
                       )),
  source_label         text,
  source_url           text,
  source_checked_at    timestamptz,
  created_at           timestamptz not null default now(),
  unique (application_id, organisation_id, role)
);

comment on table public.project_organisations is
  'Role a global organisation has on a planning application, with source provenance.';

create index if not exists project_organisations_application_idx
  on public.project_organisations (application_id);
create index if not exists project_organisations_organisation_idx
  on public.project_organisations (organisation_id);

create table if not exists public.organisation_contacts (
  id                   uuid primary key default gen_random_uuid(),
  organisation_id      uuid not null references public.organisations(id) on delete cascade,
  full_name            text,
  job_title            text,
  public_email         text,
  telephone            text,
  linkedin_url         text,
  source_label         text,
  source_url           text,
  verification_status  text not null default 'unverified'
    check (verification_status in ('source_record', 'public_business', 'verified', 'unverified')),
  last_checked_at      timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (full_name is not null or public_email is not null or telephone is not null)
);

comment on table public.organisation_contacts is
  'Public or verified business contact details only. No guessed addresses or invented people.';

create trigger organisation_contacts_updated_at
  before update on public.organisation_contacts
  for each row execute function public.set_updated_at();

create index if not exists organisation_contacts_organisation_idx
  on public.organisation_contacts (organisation_id);

-- Source tables are globally shared, but read access follows the same council
-- visibility rule as planning_applications. There are intentionally no user
-- write policies: enrichment is a trusted-source/service-role workflow.
alter table public.organisations enable row level security;
alter table public.project_organisations enable row level security;
alter table public.organisation_contacts enable row level security;

-- Supabase no longer guarantees Data API exposure for newly-created public
-- tables. Signed-in users may read through the RLS policies below; all writes
-- remain service-role only.
revoke all on public.organisations, public.project_organisations, public.organisation_contacts
  from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.organisations, public.project_organisations, public.organisation_contacts
  from authenticated;
grant select on public.organisations, public.project_organisations, public.organisation_contacts
  to authenticated;

create policy "project_organisations: select if application visible"
  on public.project_organisations for select
  to authenticated
  using (
    exists (
      select 1 from public.planning_applications pa
      where pa.id = project_organisations.application_id
    )
  );

create policy "organisations: select if linked application visible"
  on public.organisations for select
  to authenticated
  using (
    exists (
      select 1
      from public.project_organisations po
      join public.planning_applications pa on pa.id = po.application_id
      where po.organisation_id = organisations.id
    )
  );

create policy "organisation_contacts: select if linked application visible"
  on public.organisation_contacts for select
  to authenticated
  using (
    exists (
      select 1
      from public.project_organisations po
      join public.planning_applications pa on pa.id = po.application_id
      where po.organisation_id = organisation_contacts.organisation_id
    )
  );

-- Backfill only the one organisation relationship we truly hold today:
-- PlanIt's public agent_company field. No website, person or contact detail is
-- invented, and each role retains the council/PlanIt record URL when available.
insert into public.organisations (name, normalized_name, verification_status, source_label)
select distinct
  trim(pa.agent_company),
  lower(regexp_replace(trim(pa.agent_company), '\s+', ' ', 'g')),
  'source_record',
  'PlanIt planning record'
from public.planning_applications pa
where pa.agent_company is not null
  and trim(pa.agent_company) <> ''
  and lower(trim(pa.agent_company)) <> 'see source'
on conflict (normalized_name) do nothing;

insert into public.project_organisations (
  application_id, organisation_id, role, source_label, source_url, source_checked_at
)
select
  pa.id,
  o.id,
  'planning_agent',
  'PlanIt planning record',
  nullif(pa.raw_data->>'url', ''),
  pa.last_scraped_at
from public.planning_applications pa
join public.organisations o
  on o.normalized_name = lower(regexp_replace(trim(pa.agent_company), '\s+', ' ', 'g'))
where pa.agent_company is not null
  and trim(pa.agent_company) <> ''
  and lower(trim(pa.agent_company)) <> 'see source'
on conflict (application_id, organisation_id, role) do nothing;

-- Rollback:
-- drop table if exists public.organisation_contacts;
-- drop table if exists public.project_organisations;
-- drop table if exists public.organisations;
