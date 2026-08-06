-- Partner segmentation.
--
-- PlanningPing surfaces integrated features for partner networks (currently
-- GabrielCAM construction-site monitoring). Everyone else must see none of it,
-- so the standard product stays clean rather than advertising a partnership
-- most users have no relationship with.
--
-- Stored as a provider name rather than an is_gabrielcam_partner boolean:
-- NULL means no partnership, and adding a second partner later extends the
-- CHECK constraint instead of requiring another column and another flag
-- threaded through every call site.

alter table public.profiles
  add column if not exists partnership_provider text
    check (partnership_provider is null or partnership_provider in ('gabrielcam'));

-- Optional identifier the partner gives the customer (a GabrielCAM Hub ID).
-- Deliberately NOT a place for an API key: profiles is readable by its owner
-- under RLS, so a credential stored here would be readable by the browser.
-- If key-based Hub auth is needed later it belongs in its own table with no
-- authenticated-role grants, reachable only by the service role.
alter table public.profiles
  add column if not exists partner_hub_id text;

comment on column public.profiles.partnership_provider is
  'NULL = no partnership. Currently only ''gabrielcam''. Gates partner-only UI and server actions.';
comment on column public.profiles.partner_hub_id is
  'Non-secret partner-side account identifier. Never store API keys or credentials here — this row is readable by its owner.';

-- Partial index: the partner set is a small minority of profiles, so this
-- stays tiny while making "all partners" lookups cheap.
create index if not exists profiles_partnership_provider_idx
  on public.profiles (partnership_provider)
  where partnership_provider is not null;

-- Deliberately NO grant to the authenticated role on either column.
--
-- The authenticated role can only UPDATE digest_day (see the column grants on
-- this table); every other profile write goes through a server action that
-- verifies the session and then uses the service-role client — the same path
-- switchToProfessional already uses. Keeping partnership on that path means
-- the flag cannot be set by a crafted request from the browser, and leaves
-- room to verify a Hub ID against GabrielCAM before trusting it, without
-- having to change how the client works.

-- Let signup carry the answer through, the same way user_type already does.
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
  -- Whitelisted, not passed through: raw_user_meta_data is attacker-controlled
  -- at signup (auth.signUp is publicly callable with the anon key), so anything
  -- unrecognised becomes NULL rather than being stored.
  --
  -- The user_type guard is repeated here rather than trusted from the signup
  -- action, because the action isn't the only way to reach this trigger. A
  -- crafted signUp could otherwise create a homeowner account flagged as a
  -- partner — no privilege gained, but it would put partner UI in front of
  -- exactly the users it's meant to stay hidden from.
  v_partner text := case
    when v_type = 'professional'
     and new.raw_user_meta_data->>'partnership_provider' = 'gabrielcam'
    then 'gabrielcam'
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
  return new;
end;
$function$;
