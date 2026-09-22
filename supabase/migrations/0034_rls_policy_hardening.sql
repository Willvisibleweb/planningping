-- 0034: RLS policy hardening and performance tuning.
--
-- Supabase's advisor flags bare auth.uid() calls in RLS policies because they
-- can be re-evaluated for every row. Wrapping the call in a scalar subselect
-- lets Postgres treat it as an initPlan for the statement.
--
-- While touching these policies, tighten the user-owned UPDATE policies with
-- WITH CHECK as well. USING decides which existing rows can be updated; WITH
-- CHECK decides what the row is allowed to look like after the update. Without
-- it, an ownership column can become a footgun if a future grant opens it.

alter policy "profiles: select own"
  on public.profiles
  to authenticated
  using (id = (select auth.uid()));

alter policy "profiles: update own"
  on public.profiles
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "tracked_areas: select own"
  on public.tracked_areas
  to authenticated
  using (user_id = (select auth.uid()));

alter policy "tracked_areas: insert own"
  on public.tracked_areas
  to authenticated
  with check (user_id = (select auth.uid()));

alter policy "tracked_areas: update own"
  on public.tracked_areas
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "tracked_areas: delete own"
  on public.tracked_areas
  to authenticated
  using (user_id = (select auth.uid()));

alter policy "planning_applications: select if tracking council"
  on public.planning_applications
  to authenticated
  using (
    exists (
      select 1
      from public.tracked_areas ta
      where ta.council_slug = planning_applications.council_slug
        and ta.user_id = (select auth.uid())
        and ta.is_active = true
    )
  );

alter policy "digests: select own"
  on public.digests
  to authenticated
  using (user_id = (select auth.uid()));

alter policy "tracked_leads: select own"
  on public.tracked_leads
  to authenticated
  using (user_id = (select auth.uid()));

alter policy "tracked_leads: insert own"
  on public.tracked_leads
  to authenticated
  with check (user_id = (select auth.uid()));

alter policy "tracked_leads: update own"
  on public.tracked_leads
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "tracked_leads: delete own"
  on public.tracked_leads
  to authenticated
  using (user_id = (select auth.uid()));

alter policy "coverage_requests: insert own"
  on public.coverage_requests
  to authenticated
  with check (user_id = (select auth.uid()));

alter policy "coverage_requests: select own"
  on public.coverage_requests
  to authenticated
  using (user_id = (select auth.uid()));

alter policy "outreach_log: select own"
  on public.outreach_log
  to authenticated
  using (user_id = (select auth.uid()));

alter policy "outreach_log: insert own"
  on public.outreach_log
  to authenticated
  with check (user_id = (select auth.uid()));

alter policy "email_alert_log: select own"
  on public.email_alert_log
  to authenticated
  using (user_id = (select auth.uid()));

alter policy "firm_profiles: select own"
  on public.firm_profiles
  to authenticated
  using (user_id = (select auth.uid()));

alter policy "firm_profiles: insert own"
  on public.firm_profiles
  to authenticated
  with check (user_id = (select auth.uid()));

alter policy "firm_profiles: update own"
  on public.firm_profiles
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "firm_profiles: delete own"
  on public.firm_profiles
  to authenticated
  using (user_id = (select auth.uid()));

alter policy "discharge_alert_log: select own"
  on public.discharge_alert_log
  to authenticated
  using (user_id = (select auth.uid()));

alter policy "pipeline_stages: select own"
  on public.pipeline_stages
  to authenticated
  using (user_id = (select auth.uid()));

alter policy "pipeline_stages: insert own"
  on public.pipeline_stages
  to authenticated
  with check (user_id = (select auth.uid()));

alter policy "pipeline_stages: update own"
  on public.pipeline_stages
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "pipeline_stages: delete own"
  on public.pipeline_stages
  to authenticated
  using (user_id = (select auth.uid()));

alter policy "lead_events: select own"
  on public.lead_events
  to authenticated
  using (user_id = (select auth.uid()));

alter policy "lead_events: insert own"
  on public.lead_events
  to authenticated
  with check (user_id = (select auth.uid()));
