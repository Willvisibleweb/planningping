-- 0006: User types (homeowner vs professional) + billing groundwork.
--
-- Adds:
--   * profiles.user_type          — chosen at signup; drives feature access
--   * profiles.trial_ends_at      — 14-day professional trial, set at signup
--   * profiles.stripe_*           — Stripe linkage (Phase B)
--   * profiles.subscription_status — synced by the Stripe webhook
--   * plan check migrated ('free','paid') -> ('free','pro')
--   * column-level UPDATE privileges on profiles (closes a self-upgrade hole:
--     the "update own" RLS policy has no column limits, so without this a user
--     could set subscription_status='active' on their own row via PostgREST)
--   * handle_new_user() now reads user_type from signUp metadata and starts
--     the trial for professionals
--
-- After this migration, ALL server-side writes to user_type/trial/stripe
-- columns must go through the service-role admin client — the user-scoped
-- client can only update digest_day.

-- ── Columns ──────────────────────────────────────────────────────────────────

alter table public.profiles
  add column user_type              text not null default 'homeowner'
             check (user_type in ('homeowner', 'professional')),
  add column trial_ends_at          timestamptz,
  add column stripe_customer_id     text,
  add column stripe_subscription_id text,
  add column subscription_status    text;

-- plan values: 'paid' -> 'pro' (constraint name verified against pg_constraint)
alter table public.profiles drop constraint profiles_plan_check;
update public.profiles set plan = 'pro' where plan = 'paid';
alter table public.profiles add constraint profiles_plan_check
  check (plan in ('free', 'pro'));

-- Stripe webhook looks profiles up by customer id.
create unique index idx_profiles_stripe_customer_id
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- ── Lock down self-service updates ───────────────────────────────────────────
-- The "profiles: update own" RLS policy restricts WHICH ROWS a user can update,
-- but not WHICH COLUMNS. Column-level privileges close that gap: authenticated
-- users may only update digest_day on their own row.

revoke update on public.profiles from authenticated;
grant update (digest_day) on public.profiles to authenticated;

-- ── Signup trigger: read user_type from metadata, start professional trial ───
-- raw_user_meta_data comes from supabase.auth.signUp options.data and is
-- client-controllable, so the value is whitelisted here: anything other than
-- the exact string 'professional' becomes 'homeowner'. Worst case, a crafted
-- payload claims the 14-day trial that the signup form freely offers anyway.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_type text := case
    when new.raw_user_meta_data->>'user_type' = 'professional' then 'professional'
    else 'homeowner'
  end;
begin
  insert into public.profiles (id, email, user_type, trial_ends_at)
  values (
    new.id,
    new.email,
    v_type,
    case when v_type = 'professional' then now() + interval '14 days' end
  );
  return new;
end;
$$;

-- ── Backfill existing users ──────────────────────────────────────────────────
-- Founder accounts become professionals with a fresh trial; everyone else
-- (including the organic Stafford signup) keeps the homeowner default.

update public.profiles
   set user_type     = 'professional',
       trial_ends_at = now() + interval '14 days'
 where lower(email) in (
   'willkelsall@icloud.com',
   'wkelsall44@gmail.com',
   'william.kelwave@gmail.com'
 );

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- alter table public.profiles
--   drop column user_type,
--   drop column trial_ends_at,
--   drop column stripe_customer_id,
--   drop column stripe_subscription_id,
--   drop column subscription_status;
-- alter table public.profiles drop constraint profiles_plan_check;
-- update public.profiles set plan = 'paid' where plan = 'pro';
-- alter table public.profiles add constraint profiles_plan_check
--   check (plan in ('free', 'paid'));
-- grant update on public.profiles to authenticated;
-- (and restore the previous handle_new_user() from supabase/schema.sql)
