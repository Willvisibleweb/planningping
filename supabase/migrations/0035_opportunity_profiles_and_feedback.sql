-- 0035: Company-specific opportunity intelligence foundations.
--
-- This keeps the existing planning application and firm letterhead tables
-- intact. opportunity_profiles is the scoring profile: one primary profile for
-- normal accounts today, multiple client profiles for agency accounts later.
-- opportunity_feedback records lightweight user judgements so recommendations
-- can hide dismissed rows now and learn from them later.

create table if not exists public.opportunity_profiles (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null references public.profiles(id) on delete cascade,
  name                       text not null,
  is_primary                 boolean not null default true,
  profile_kind               text not null default 'own_company'
                             check (profile_kind in ('own_company', 'client_company')),
  primary_services           text[] not null default '{}',
  secondary_services         text[] not null default '{}',
  base_location              text,
  operating_radius_miles     int check (operating_radius_miles is null or operating_radius_miles > 0),
  regions                    text,
  preferred_sectors          text[] not null default '{}',
  preferred_project_types    text,
  min_project_size           numeric(14,2) check (min_project_size is null or min_project_size >= 0),
  max_project_size           numeric(14,2) check (max_project_size is null or max_project_size >= 0),
  min_residential_units      int check (min_residential_units is null or min_residential_units >= 0),
  max_residential_units      int check (max_residential_units is null or max_residential_units >= 0),
  typical_package_value      text,
  unwanted_work              text,
  preferred_stages           text[] not null default '{}',
  preferred_clients          text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint opportunity_profiles_size_order check (
    min_project_size is null or max_project_size is null or min_project_size <= max_project_size
  ),
  constraint opportunity_profiles_units_order check (
    min_residential_units is null or max_residential_units is null or min_residential_units <= max_residential_units
  )
);

comment on table public.opportunity_profiles is
  'Company/client-specific recommendation profile used to score planning opportunities. Multiple rows support future agency accounts.';

create unique index if not exists opportunity_profiles_one_primary_per_user
  on public.opportunity_profiles (user_id)
  where is_primary;

create index if not exists opportunity_profiles_user_idx
  on public.opportunity_profiles (user_id, is_primary desc, created_at asc);

alter table public.opportunity_profiles enable row level security;

create policy "opportunity_profiles: select own" on public.opportunity_profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "opportunity_profiles: insert own" on public.opportunity_profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "opportunity_profiles: update own" on public.opportunity_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "opportunity_profiles: delete own" on public.opportunity_profiles
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger opportunity_profiles_updated_at
  before update on public.opportunity_profiles
  for each row execute function public.set_updated_at();

create table if not exists public.opportunity_feedback (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  opportunity_profile_id uuid references public.opportunity_profiles(id) on delete set null,
  application_id          uuid not null references public.planning_applications(id) on delete cascade,
  verdict                text not null check (verdict in ('good', 'not_relevant')),
  reason                 text check (
                           reason is null or reason in (
                             'too_small', 'too_large', 'wrong_sector', 'wrong_location',
                             'wrong_project_type', 'too_early', 'too_late',
                             'not_a_service', 'other'
                           )
                         ),
  note                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.opportunity_feedback is
  'Per-user opportunity feedback. Used immediately to hide dismissed opportunities and later to tune scoring.';

create index if not exists opportunity_feedback_user_verdict_idx
  on public.opportunity_feedback (user_id, verdict, updated_at desc);
create index if not exists opportunity_feedback_application_idx
  on public.opportunity_feedback (application_id);
create unique index if not exists opportunity_feedback_profile_dedup_idx
  on public.opportunity_feedback (user_id, application_id, opportunity_profile_id)
  where opportunity_profile_id is not null;
create unique index if not exists opportunity_feedback_no_profile_dedup_idx
  on public.opportunity_feedback (user_id, application_id)
  where opportunity_profile_id is null;

alter table public.opportunity_feedback enable row level security;

create policy "opportunity_feedback: select own" on public.opportunity_feedback
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "opportunity_feedback: insert own" on public.opportunity_feedback
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "opportunity_feedback: update own" on public.opportunity_feedback
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "opportunity_feedback: delete own" on public.opportunity_feedback
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger opportunity_feedback_updated_at
  before update on public.opportunity_feedback
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.opportunity_profiles to authenticated;
grant select, insert, update, delete on public.opportunity_feedback to authenticated;
