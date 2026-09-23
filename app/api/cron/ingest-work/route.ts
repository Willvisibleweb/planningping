// Step 2 of 3: drain the queue, a few sources at a time.
//
// This is the job that replaces the 300-second monolith. It claims a small
// batch, fetches each source, and stops well inside its own budget. Whatever it
// does not finish is still queued, so the next invocation picks up exactly
// where this one stopped — including work abandoned by a function Vercel
// killed, because an expired lease makes a job claimable again.
//
// Run it often. Every fifteen minutes with a batch of three means the whole day
// is available to get through the queue, instead of one five-minute window in
// which PlanIt must answer for every territory at once.
//
// Answers 202 immediately and works in the background — three sources take
// about 72 seconds and cron-job.org hangs up at 30. Add ?wait=1 for the real
// result. See lib/api/backgroundCron.ts.
//
// Only one worker fetches at a time, via the existing pipeline lock. Two
// concurrent workers would not corrupt anything — the claim is atomic — but
// they would double our request rate against the source that rate-limits us,
// which is the failure this whole split exists to fix.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCouncilResolver } from '@/lib/ingest/councilResolver'
import { ingestOneSource } from '@/lib/ingest/ingestSource'
import {
  claimJobs,
  completeJob,
  failJob,
  ingestPlanDate,
  loadJobAreas,
  loadQueueProgress,
  skipJob,
} from '@/lib/ingest/ingestQueueStore'
import { logPipelineEvent } from '@/lib/reliability/pipelineLog'
import {
  acquirePipelineLock,
  PLANIT_PIPELINE_LOCK,
  releasePipelineLock,
} from '@/lib/reliability/pipelineLock'
import { isAuthorisedCron, respondInBackground } from '@/lib/api/backgroundCron'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://planningping.com'
/** Sources claimed per invocation. Small on purpose — see DEADLINE_MS. */
const DEFAULT_BATCH = 3
/** Stop starting new sources here, leaving room to finish the current one. */
const DEADLINE_MS = 200_000
/** A claimed job is ours for this long before another worker may take it. */
const LEASE_SECONDS = 280
/** Politeness gap between sources, as the single-function ingest had. */
const DELAY_MS = 3000

export async function GET(request: NextRequest) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const planDate = params.get('date') ?? ingestPlanDate()
  const batchSize = Math.max(1, Math.min(Number(params.get('batch')) || DEFAULT_BATCH, 10))

  return respondInBackground(request, { job: 'ingest-work' }, () => drainQueue({ planDate, batchSize }))
}

async function drainQueue(opts: { planDate: string; batchSize: number }): Promise<Record<string, unknown>> {
  const { planDate, batchSize } = opts
  const supabase = createAdminClient()

  const lockResult = await acquirePipelineLock(supabase, PLANIT_PIPELINE_LOCK, 600, { job: 'ingest-work', trigger: 'cron' })
  if (!lockResult.acquired) {
    return {
      skipped: true,
      job: 'ingest-work',
      reason: lockResult.error ? 'pipeline_lock_unavailable' : 'pipeline_lock_held',
      locked_until: lockResult.lockedUntil,
    }
  }
  const lock = lockResult.lock

  const startedAt = Date.now()
  const processed: Array<Record<string, unknown>> = []
  let completed = 0
  let failed = 0
  let rateLimited = 0

  try {
    const jobs = await claimJobs(supabase, {
      planDate,
      limit: batchSize,
      worker: `vercel-${process.env.VERCEL_DEPLOYMENT_ID ?? 'local'}`,
      leaseSeconds: LEASE_SECONDS,
    })

    if (jobs.length === 0) {
      const progress = await loadQueueProgress(supabase, planDate)
      return {
        ran_at: new Date().toISOString(),
        plan_date: planDate,
        claimed: 0,
        reason: progress.total === 0 ? 'nothing planned for today yet' : 'no sources due right now',
        queue: progress,
      }
    }

    // One resolver for the whole batch — see lib/ingest/councilResolver.ts for
    // the Bristol duplicate this prevents.
    const resolver = await createCouncilResolver(supabase)

    for (const job of jobs) {
      if (Date.now() - startedAt > DEADLINE_MS) {
        // Hand the rest back rather than risk being killed mid-source. The
        // lease expires on its own, so these become claimable again shortly.
        processed.push({ source: job.source_key, skipped: 'worker deadline reached' })
        break
      }

      // Re-read the areas now rather than trusting what was planned this
      // morning: a territory deleted or deactivated since should not be
      // fetched for, or emailed about.
      const areas = await loadJobAreas(supabase, job.area_ids)
      if (areas.length === 0) {
        await skipJob(supabase, job.id, 'no active tracked areas remain for this source')
        processed.push({ source: job.source_key, status: 'skipped', reason: 'no active territories' })
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
          areas,
          lastSuccessAt: job.last_success_at,
        },
        { runId: job.run_id, resolver, siteUrl: SITE_URL },
      )

      if (outcome.status === 'failed') {
        failed++
        if (outcome.rateLimited) rateLimited++
        const retry = await failJob(supabase, job, outcome)
        processed.push({
          source: job.source_key,
          status: 'failed',
          attempt: job.attempts,
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

    const queue = await loadQueueProgress(supabase, planDate)

    if (rateLimited > 0) {
      await logPipelineEvent(supabase, {
        runId: jobs[0]?.run_id ?? null,
        job: 'ingest',
        stage: 'rate_limit',
        severity: 'warning',
        message: `${rateLimited} source${rateLimited === 1 ? '' : 's'} rate-limited by PlanIt; each backed off independently`,
      })
    }

    return {
      ran_at: new Date().toISOString(),
      plan_date: planDate,
      claimed: jobs.length,
      completed,
      failed,
      rate_limited: rateLimited,
      queue,
      processed,
    }
  } finally {
    await releasePipelineLock(supabase, lock)
  }
}
