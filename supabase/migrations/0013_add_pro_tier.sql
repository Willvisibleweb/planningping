-- 0013: pro_tier — which paid tier a professional account is on ('mid' or
-- 'top'). Separate dimension from user_type/hasProAccess(): user_type still
-- gates whether pro features (pipeline, outreach, alerts, relevance filter)
-- are visible at all; pro_tier only controls radius/tracked-area quotas once
-- hasProAccess() is already true. Null = free tier, or trialing without a
-- completed checkout yet (see lib/access.ts effectiveTier(), which defaults
-- an untiered-but-trialing user to 'top' limits as a showcase).
--
-- No grant statement needed: migration 0006's table-wide
-- `revoke update on public.profiles from authenticated` does not extend to
-- columns added later, so this column is automatically unwritable by the
-- authenticated role, same as stripe_customer_id etc. All writes go through
-- the Stripe webhook via the admin client.
--
-- Rollback:
--   alter table public.profiles drop column if exists pro_tier;

alter table public.profiles
  add column if not exists pro_tier text check (pro_tier in ('mid', 'top'));

-- Backfill: the one existing active subscriber (test-mode data from
-- development, £29/mo) maps to Mid — matches their existing price point.
update public.profiles
   set pro_tier = 'mid'
 where subscription_status = 'active'
   and pro_tier is null;
