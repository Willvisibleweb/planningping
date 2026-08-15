-- Phase 1: the pipeline data model.
--
-- PlanningPing is repositioning from "planning alerts" to a lightweight CRM for
-- civils firms. The data is the trigger; the product is the workflow that turns
-- an application into a won job. This migration is that workflow's spine.
--
-- Deliberately EXTENDS tracked_leads rather than adding a parallel `leads`
-- table. Two tables meaning the same thing is how data rots, and tracked_leads
-- already has the FK to planning_applications, RLS on all four operations, and
-- six live rows across four users.

-- ---------------------------------------------------------------------------
-- 1. Per-user stages
-- ---------------------------------------------------------------------------
-- Configurable from day one, because engineering firms run their own process
-- and a hardcoded enum would need a migration every time one of them asks.

create table if not exists public.pipeline_stages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  position   int  not null,
  -- Terminal stages. Flags rather than name-matching, so a firm renaming "Won"
  -- to "Awarded" doesn't break win-rate reporting later.
  is_won     boolean not null default false,
  is_lost    boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, position),
  unique (user_id, name),
  -- A stage cannot be both outcomes.
  constraint pipeline_stages_one_outcome check (not (is_won and is_lost))
);

comment on table public.pipeline_stages is
  'Per-user pipeline stages. Seeded with defaults on signup; users may rename, reorder and add their own.';

alter table public.pipeline_stages enable row level security;

create policy "pipeline_stages: select own" on public.pipeline_stages
  for select using (user_id = auth.uid());
create policy "pipeline_stages: insert own" on public.pipeline_stages
  for insert with check (user_id = auth.uid());
create policy "pipeline_stages: update own" on public.pipeline_stages
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "pipeline_stages: delete own" on public.pipeline_stages
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Seed defaults for everyone who already exists
-- ---------------------------------------------------------------------------
-- Stage names come from the Phase 1 brief and differ from the hardcoded set the
-- app shipped with (Identified / Negotiating). Existing leads are mapped onto
-- these below rather than stranded.

insert into public.pipeline_stages (user_id, name, position, is_won, is_lost)
select u.id, s.name, s.position, s.is_won, s.is_lost
from auth.users u
cross join (values
  ('New',             1, false, false),
  ('Qualified',       2, false, false),
  ('Contacted',       3, false, false),
  ('In conversation', 4, false, false),
  ('Won',             5, true,  false),
  ('Lost',            6, false, true )
) as s(name, position, is_won, is_lost)
on conflict (user_id, name) do nothing;

-- New signups get the same set. Extends the existing trigger rather than adding
-- a second one on auth.users — two triggers writing profiles would be a race.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_type text := case
    when new.raw_user_meta_data->>'user_type' = 'professional' then 'professional'
    else 'homeowner'
  end;
  v_partner text := case
    when new.raw_user_meta_data->>'partnership_provider' = 'gabrielcam' then 'gabrielcam'
    else null
  end;
begin
  insert into public.profiles (id, email, user_type, trial_ends_at, partnership_provider)
  values (
    new.id,
    new.email,
    v_type,
    case when v_type = 'professional' then now() + interval '14 days' end,
    v_partner
  );

  insert into public.pipeline_stages (user_id, name, position, is_won, is_lost)
  values
    (new.id, 'New',             1, false, false),
    (new.id, 'Qualified',       2, false, false),
    (new.id, 'Contacted',       3, false, false),
    (new.id, 'In conversation', 4, false, false),
    (new.id, 'Won',             5, true,  false),
    (new.id, 'Lost',            6, false, true );

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Lead fields
-- ---------------------------------------------------------------------------

alter table public.tracked_leads
  add column if not exists stage_id       uuid references public.pipeline_stages(id) on delete restrict,
  add column if not exists score_at_add   int,
  add column if not exists value_estimate numeric(12,2),
  add column if not exists owner          text;

-- score_at_add, not score. Applications are re-scored as descriptions and
-- rules change, so a single denormalised column would silently drift from the
-- live value with no way to tell. Keeping the score at the moment of adding
-- makes the drift legible: "scored 82 when you added it, now 64" is a signal
-- about the lead, not a bug.
comment on column public.tracked_leads.score_at_add is
  'Civils relevance score when this lead was added. Compare against the live application score to see drift; do not treat as current.';
comment on column public.tracked_leads.stage_id is
  'FK to the user''s own pipeline_stages. Replaces pipeline_stage (text), which is retained until the app has fully migrated and is dropped in a later migration.';

-- Backfill: map the old hardcoded names onto the new defaults.
update public.tracked_leads l
set stage_id = s.id
from public.pipeline_stages s
where s.user_id = l.user_id
  and l.stage_id is null
  and s.name = case l.pipeline_stage
                 when 'Identified'  then 'New'
                 when 'Negotiating' then 'In conversation'
                 else l.pipeline_stage
               end;

-- Seed score_at_add from the application's current score. Imperfect for leads
-- added before this column existed — it records today's score, not the score
-- on the day they were added — but a null there would be indistinguishable
-- from "never scored", which is worse.
update public.tracked_leads l
set score_at_add = a.score
from public.planning_applications a
where a.id = l.application_id and l.score_at_add is null;

-- ---------------------------------------------------------------------------
-- 4. Activity timeline
-- ---------------------------------------------------------------------------
-- Append-only. A lead's history is evidence of work done and must not be
-- silently editable — hence no update policy below, only insert and select.

create table if not exists public.lead_events (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.tracked_leads(id) on delete cascade,
  -- Denormalised from the lead so RLS is a single-column check rather than a
  -- join on every read.
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null check (type in (
               'created', 'stage_change', 'note',
               'letter_generated', 'email_logged', 'call_logged'
             )),
  body       text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

comment on table public.lead_events is
  'Append-only activity log for a lead. No update policy by design — a timeline that can be rewritten is not a record.';

create index if not exists lead_events_lead_idx on public.lead_events (lead_id, created_at desc);

alter table public.lead_events enable row level security;

create policy "lead_events: select own" on public.lead_events
  for select using (user_id = auth.uid());
create policy "lead_events: insert own" on public.lead_events
  for insert with check (user_id = auth.uid());
-- No update or delete policy: append-only.

-- ---------------------------------------------------------------------------
-- 5. Fold outreach_log into the timeline
-- ---------------------------------------------------------------------------
-- outreach_log is a strict subset of lead_events (user_id, lead_id, kind,
-- created_at). Leaving both would mean a timeline that is missing the letters
-- and emails already recorded. The old table is kept for now and dropped once
-- nothing reads it.

insert into public.lead_events (lead_id, user_id, type, body, created_at, created_by)
select o.lead_id,
       o.user_id,
       case o.kind when 'letter' then 'letter_generated' else 'email_logged' end,
       'Migrated from outreach log',
       o.created_at,
       o.user_id
from public.outreach_log o
where exists (select 1 from public.tracked_leads l where l.id = o.lead_id)
  and not exists (
    select 1 from public.lead_events e
    where e.lead_id = o.lead_id and e.created_at = o.created_at
  );

-- Every existing lead gets an opening event, so no timeline starts empty.
insert into public.lead_events (lead_id, user_id, type, body, created_at, created_by)
select l.id, l.user_id, 'created', 'Added to pipeline', l.created_at, l.user_id
from public.tracked_leads l
where not exists (
  select 1 from public.lead_events e where e.lead_id = l.id and e.type = 'created'
);
