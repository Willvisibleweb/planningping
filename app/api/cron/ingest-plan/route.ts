// Step 1 of 3: decide what today's ingest consists of.
//
// This job does no PlanIt fetching for territories. It reconciles plan limits,
// pulls the tenders feed (one HTTP call), and writes one queued row per source.
// Everything expensive and rate-limitable is left to /api/cron/ingest-work,
// which can take as many invocations as it needs.
//
// Keeping the planner separate is what makes the day's work a fact in the
// database rather than a list that only ever existed inside one function's
// memory — which is why the old ingest could be killed at 300s and leave no
// record of the territories it never reached.
//
// Answers 202 immediately and works in the background; ?wait=1 blocks for the
// real result. See lib/api/backgroundCron.ts.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforcePlanLimitsForAll } from '@/lib/plan/enforceLimits'
import { ingestTenders } from '@/lib/tenders/ingestTenders'
import { finishPipelineRun, logPipelineEvent, startPipelineRun } from '@/lib/reliability/pipelineLog'
import { ingestPlanDate, planDayQueue, runIdForDay } from '@/lib/ingest/ingestQueueStore'
import { isAuthorisedCron, respondInBackground } from '@/lib/api/backgroundCron'
import type { AreaRow } from '@/lib/ingest/areaAlerts'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return respondInBackground(request, { job: 'ingest-plan' }, planToday)
}

async function planToday(): Promise<Record<string, unknown>> {
  const supabase = createAdminClient()
  const planDate = ingestPlanDate()

  // Reuse the run this day was already planned under. This route runs on every
  // scheduled tick, not once a morning, and opening a run per call left one
  // permanently 'running' behind each repeat — no job pointed at it, so
  // finalise never closed it, and the health endpoint read them as stuck.
  const existingRunId = await runIdForDay(supabase, planDate)
  const runId = existingRunId ?? (await startPipelineRun(supabase, 'ingest', 'cron'))
  if (existingRunId) {
    return { ran_at: new Date().toISOString(), run_id: runId, plan_date: planDate, already_planned: true }
  }

  // Bring everyone's areas back within their plan before queueing anything for
  // them. A trial ending or a downgrade otherwise leaves extra areas in place
  // and we fetch them from PlanIt daily at our own cost.
  const reconciled = await enforcePlanLimitsForAll(supabase)
  if (reconciled.length > 0) {
    console.log('plan limits reconciled:', JSON.stringify(reconciled))
  }

  // Tenders is one call and a couple of seconds, so it belongs here rather
  // than in the queue. Wrapped so a tender-feed failure cannot stop the
  // planning ingest being planned.
  let tenders: Awaited<ReturnType<typeof ingestTenders>> | { error: string }
  try {
    tenders = await ingestTenders(supabase)
  } catch (e) {
    await logPipelineEvent(supabase, { runId, job: 'ingest', stage: 'tenders', severity: 'error', message: 'Tender ingest failed', error: e })
    tenders = { error: 'tender ingest failed — see pipeline_events' }
  }

  const { data: areas, error } = await supabase
    .from('tracked_areas')
    .select('id, user_id, postcode, radius_metres, alerts_enabled, min_band, label, council_slug, last_planit_fetch_at')
    .eq('is_active', true)
    .order('last_planit_fetch_at', { ascending: true, nullsFirst: true })
  if (error) {
    await logPipelineEvent(supabase, { runId, job: 'ingest', stage: 'load_areas', severity: 'critical', message: 'Could not load tracked areas', error: error.message })
    await finishPipelineRun(supabase, runId, 'failed', { stage: 'load_areas' })
    throw new Error(`could not load tracked areas: ${error.message}`)
  }

  let plan
  try {
    plan = await planDayQueue(supabase, { planDate, runId, areas: (areas ?? []) as AreaRow[] })
  } catch (e) {
    await logPipelineEvent(supabase, { runId, job: 'ingest', stage: 'plan_queue', severity: 'critical', message: 'Could not write the ingest queue', error: e })
    await finishPipelineRun(supabase, runId, 'failed', { stage: 'plan_queue' })
    throw e
  }

  await logPipelineEvent(supabase, {
    runId, job: 'ingest', stage: 'plan_queue', severity: 'info',
    message: `Queued ${plan.planned} source${plan.planned === 1 ? '' : 's'} for ${planDate}` +
      (plan.alreadyQueued > 0 ? ` (${plan.alreadyQueued} already queued)` : ''),
  })

  // A day with nothing to fetch has no job carrying this run's id, so nothing
  // would ever close it. Close it here instead of leaving it 'running'.
  if (plan.planned === 0) {
    await finishPipelineRun(supabase, runId, 'success', { plan_date: planDate, sources_total: 0, reason: 'no active territories to queue' })
  }

  // Otherwise the run is left open deliberately: ingest-finalise closes it once
  // the queue has drained, so an unfinished run means unfinished work.
  return {
    ran_at: new Date().toISOString(),
    run_id: runId,
    plan_date: planDate,
    areas_active: areas?.length ?? 0,
    sources_queued: plan.planned,
    already_queued: plan.alreadyQueued,
    tenders,
  }
}
