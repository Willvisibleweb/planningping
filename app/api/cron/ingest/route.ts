// The whole ingest in one invocation: plan the day, drain as much of the queue
// as fits the budget, close the day if the queue emptied. The finer-grained
// path is three separate jobs:
//
//   /api/cron/ingest-plan      queue today's sources        (daily, 04:45)
//   /api/cron/ingest-work      fetch a few at a time        (every 15 min)
//   /api/cron/ingest-finalise  digest, sweeps, close run    (daily, 21:00)
//
// This route IS scheduled — it is the long-standing cron-job.org job, and the
// Vercel daily cron — so it doubles as the backstop: if nothing else fires, one
// call still moves the whole day forward. It is also the one to hit by hand
// when the question is "run the ingest now and tell me what happened"
// (with ?wait=1, or the answer is just 202).
//
// Do not point it at a short interval. It opens a pipeline run per call, so a
// 15-minute schedule would write ~96 run records a day and make the history
// unreadable; /api/cron/ingest-work is the one built for that.
//
// Whatever this does not finish stays queued for the workers, which is the
// difference between it and what used to live here: the old version was a
// single 300-second function
// that walked every territory, and every recorded run was 'partial' or
// 'failed' — killed by Vercel mid-loop, or rate-limited by PlanIt once it was
// six sources deep. Losing the back half of the territory list every morning
// was not a bad day; it was the architecture.
//
// The per-source work itself lives in lib/ingest/ingestSource.ts, shared with
// the worker, so there is exactly one implementation of it.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCouncilResolver } from '@/lib/ingest/councilResolver'
import { enforcePlanLimitsForAll } from '@/lib/plan/enforceLimits'
import { ingestTenders } from '@/lib/tenders/ingestTenders'
import { ingestOneSource } from '@/lib/ingest/ingestSource'
import {
  claimJobs,
  completeJob,
  failJob,
  ingestPlanDate,
  loadJobAreas,
  loadQueueProgress,
  planDayQueue,
  runIdForDay,
  skipJob,
} from '@/lib/ingest/ingestQueueStore'
import { finishPipelineRun, logPipelineEvent, startPipelineRun } from '@/lib/reliability/pipelineLog'
import { finaliseIngestDay } from '@/lib/ingest/finaliseIngestDay'
import { runHealthAlertCheck } from '@/lib/reliability/healthAlerts'
import {
  acquirePipelineLock,
  PLANIT_PIPELINE_LOCK,
  releasePipelineLock,
} from '@/lib/reliability/pipelineLock'
import { isAuthorisedCron, respondInBackground } from '@/lib/api/backgroundCron'
import type { AreaRow } from '@/lib/ingest/areaAlerts'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://planningping.com'
const DEADLINE_MS = 200_000
const DELAY_MS = 3000
const LEASE_SECONDS = 280

export async function GET(request: NextRequest) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return respondInBackground(request, { job: 'ingest' }, runWholeDay)
}

async function runWholeDay(): Promise<Record<string, unknown>> {
  const supabase = createAdminClient()
  const planDate = ingestPlanDate()
  const lockResult = await acquirePipelineLock(supabase, PLANIT_PIPELINE_LOCK, 600, { job: 'ingest', trigger: 'manual' })
  if (!lockResult.acquired) {
    return {
      skipped: true,
      job: 'ingest',
      reason: lockResult.error ? 'pipeline_lock_unavailable' : 'pipeline_lock_held',
      locked_until: lockResult.lockedUntil,
    }
  }
  const lock = lockResult.lock

  const startedAt = Date.now()
  const processed: Array<Record<string, unknown>> = []
  let completed = 0
  let failed = 0
  let stoppedEarly = false

  try {
    // Reuse the run this day was already planned under. Opening one per call
    // orphaned a run every morning: finalise closes the run the day's jobs
    // point at, which is the planner's, so this one was never closed and the
    // health endpoint read it as a run killed mid-flight. Same bug as
    // ingest-plan had — fixed in both places now.
    const existingRunId = await runIdForDay(supabase, planDate)
    const runId = existingRunId ?? (await startPipelineRun(supabase, 'ingest', 'manual'))

    const reconciled = await enforcePlanLimitsForAll(supabase)
    if (reconciled.length > 0) console.log('plan limits reconciled:', JSON.stringify(reconciled))

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

    const plan = await planDayQueue(supabase, { planDate, runId, areas: (areas ?? []) as AreaRow[] })
    const resolver = await createCouncilResolver(supabase)

    // Drain until the queue is empty or we run out of budget.
    for (;;) {
      if (Date.now() - startedAt > DEADLINE_MS) {
        stoppedEarly = true
        break
      }
      const jobs = await claimJobs(supabase, {
        planDate,
        limit: 1,
        worker: 'manual-ingest',
        leaseSeconds: LEASE_SECONDS,
      })
      if (jobs.length === 0) break
      const job = jobs[0]

      const jobAreas = await loadJobAreas(supabase, job.area_ids)
      if (jobAreas.length === 0) {
        await skipJob(supabase, job.id, 'no active tracked areas remain for this source')
        processed.push({ source: job.source_key, status: 'skipped' })
        continue
      }

      const outcome = await ingestOneSource(
        supabase,
        {
          queryKey: job.query_key,
          sourceKey: job.source_key,
          sourceLabel: job.source_label,
          councilSlug: job.council_slug,
          postcode: job.postcode,
          radiusKm: Number(job.radius_km),
          areas: jobAreas,
          lastSuccessAt: job.last_success_at,
        },
        { runId: job.run_id ?? runId, resolver, siteUrl: SITE_URL },
      )

      if (outcome.status === 'failed') {
        failed++
        const retry = await failJob(supabase, job, outcome)
        processed.push({
          source: job.source_key,
          status: 'failed',
          rate_limited: outcome.rateLimited,
          next: retry.status === 'failed' ? 'gave up for today' : `retry in ${retry.waitMinutes} min`,
          error: outcome.error,
        })
      } else {
        completed++
        await completeJob(supabase, job.id, outcome)
        processed.push({
          source: job.source_key,
          status: outcome.status,
          fetched: outcome.fetched,
          new: outcome.newRefs,
          changed: outcome.changed,
          alerts_sent: outcome.alertsSent,
          window: outcome.window,
        })
      }

      await new Promise((r) => setTimeout(r, DELAY_MS))
    }

    const drained = await loadQueueProgress(supabase, planDate)

    // Close the day here when the queue emptied. On a Hobby plan this route is
    // the only ingest cron there is, so if it did not finalise, the Monday
    // digest would simply never send — which is the regression that the whole
    // ingest-finalise split would otherwise have introduced.
    const finalise = await finaliseIngestDay(supabase, { planDate, siteUrl: SITE_URL, runId })

    // A day with nothing queued has no job carrying this run's id, so finalise
    // declines and nothing else would ever close it. The other way to strand a
    // run, and the same fix as ingest-plan.
    if (!finalise.finalised && drained.total === 0 && !existingRunId) {
      await finishPipelineRun(supabase, runId, 'success', { plan_date: planDate, sources_total: 0, reason: 'no active territories to queue' })
    }

    if (!finalise.finalised) {
      await logPipelineEvent(supabase, {
        runId, job: 'ingest', stage: 'manual_drain', severity: 'info',
        message: `Run handled ${completed} source${completed === 1 ? '' : 's'}; ${drained.pending + drained.running} still queued`,
      })
    }

    const healthAlert = await runHealthAlertCheck({ db: supabase })

    return {
      ran_at: new Date().toISOString(),
      run_id: runId,
      plan_date: planDate,
      source: 'planit',
      sources_queued: plan.planned,
      already_queued: plan.alreadyQueued,
      completed,
      failed,
      stopped_early: stoppedEarly,
      queue: finalise.queue,
      finalised: finalise.finalised,
      next_step: finalise.finalised
        ? 'day closed'
        : 'remaining sources stay queued; run this again or call /api/cron/ingest-work',
      tenders,
      digest: finalise.digest ?? null,
      health_alert: healthAlert,
      processed,
    }
  } finally {
    await releasePipelineLock(supabase, lock)
  }
}
