-- 0033: Production-readiness hardening from the Supabase advisors.
--
-- This migration intentionally fixes only the advisor findings that are safe to
-- apply without changing PlanningPing's access model:
--
--   * handle_new_user() is a trigger function. It must run when Supabase inserts
--     an auth.users row, but nobody should be able to call it directly through
--     /rest/v1/rpc/handle_new_user.
--   * set_updated_at() is used by triggers. Pinning search_path prevents a
--     caller-controlled path from influencing object resolution.
--   * Foreign-key columns get covering indexes so deletes/updates and joins do
--     not degrade as paying-user data grows.
--   * One duplicate council_slug index is removed.
--
-- Deliberately not changed here:
--   * public_applications, seo_locations and coverage_points remain
--     SECURITY DEFINER views because the public SEO pages intentionally expose
--     a curated read-only projection/aggregate of planning_applications while
--     the base table stays protected by tracked-area RLS. See migration 0024.
--   * auth_attempts and location_subscriptions keep RLS enabled with no public
--     policies because they are service-role-only tables.

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create index if not exists coverage_requests_user_id_idx
  on public.coverage_requests (user_id);

create index if not exists discharge_alert_log_discharge_application_id_idx
  on public.discharge_alert_log (discharge_application_id);

create index if not exists lead_events_created_by_idx
  on public.lead_events (created_by);

create index if not exists lead_events_user_id_idx
  on public.lead_events (user_id);

create index if not exists tracked_leads_application_id_idx
  on public.tracked_leads (application_id);

create index if not exists tracked_leads_stage_id_idx
  on public.tracked_leads (stage_id);

drop index if exists public.idx_planning_applications_council_slug;
