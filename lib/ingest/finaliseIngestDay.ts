// The work that happens once, after the day's sources are in.
//
// Discharge sweeps, the Monday digest, and closing the pipeline run. Shared by
// /api/cron/ingest-finalise and the one-shot /api/cron/ingest, because on a
// Vercel Hobby plan there are only two cron slots and the one-shot route has
// to be able to finish the day by itself. Losing the digest to a scheduling
// detail is exactly the kind of silent regression this module exists to stop.
//
// Safe to run repeatedly: the digest has its own exact-window guard, the
// discharge sweep is idempotent, and finishing an already-finished run just
// rewrites the same summary.

import type { createAdminClient } from '@/lib/supabase/admin'
import { resolveDischargeParents } from '@/lib/ingest/resolveDischargeParents'
import { flagStaleDischarges } from '@/lib/ingest/flagStaleDischarges'
import { sendDischargeAlerts } from '@/lib/alerts/dischargeAlerts'
import { runWeeklyDigest } from '@/lib/email/runWeeklyDigest'
import { runLocationDigest } from '@/lib/email/runLocationDigest'
import { finishPipelineRun, logPipelineEvent } from '@/lib/reliability/pipelineLog'
import { loadQueueProgress } from '@/lib/ingest/ingestQueueStore'
import { isQueueComplete } from '@/lib/reliability/ingestQueue'

type AdminClient = ReturnType<typeof createAdminClient>

export interface FinaliseResult {
  finalised: boolean
  reason?: string
  outcome?: 'success' | 'partial'
  runId?: string | null
  dischargeParentsResolved?: number
  dischargeNewlyStale?: number
  dischargeAlertsSent?: number
  digest?: Awaited<ReturnType<typeof runWeeklyDigest>> | null
  locationDigest?: Awaited<ReturnType<typeof runLocationDigest>> | null
  queue: Awaited<ReturnType<typeof loadQueueProgress>>
}

export async function finaliseIngestDay(
  db: AdminClient,
  opts: { planDate: string; siteUrl: string; runId?: string | null; force?: boolean },
): Promise<FinaliseResult> {
  const queue = await loadQueueProgress(db, opts.planDate)

  // The day's queue may legitimately still be draining. Only a forced call
  // closes the run early; otherwise say so and come back.
  if (!isQueueComplete(queue) && !opts.force) {
    return {
      finalised: false,
      reason: queue.total === 0 ? 'nothing was planned for today' : 'sources still queued',
      queue,
    }
  }

  // Parent-ID resolution runs every day: a discharge row's parent is often
  // ingested later than the discharge itself. Then stale-flagging, then the
  // alert, which reads both.
  const dischargeParentsResolved = await resolveDischargeParents(db)
  const newlyStale = await flagStaleDischarges(db)
  const dischargeAlertsSent = await sendDischargeAlerts(db, {
    newApplications: [],
    staleRows: newlyStale,
    siteUrl: opts.siteUrl,
  })

  const isMonday = new Date().getUTCDay() === 1
  const digest = isMonday ? await runWeeklyDigest(db, { siteUrl: opts.siteUrl }) : null

  // The public location pages promise a free weekly email. It rides the same
  // Monday slot as the customer digest but is a separate audience with its own
  // unsubscribe path, so a failure in one must not stop the other.
  let locationDigest: Awaited<ReturnType<typeof runLocationDigest>> | null = null
  if (isMonday) {
    try {
      locationDigest = await runLocationDigest(db, { siteUrl: opts.siteUrl })
    } catch (e) {
      await logPipelineEvent(db, {
        runId: opts.runId ?? null, job: 'ingest', stage: 'location_digest', severity: 'error',
        message: 'Location digest failed', error: e,
      })
    }
  }

  // Prefer the run the planner opened, so the day has one run rather than one
  // per invocation that happened to touch it.
  let runId = opts.runId ?? null
  const { data: jobs } = await db
    .from('ingest_jobs')
    .select('run_id')
    .eq('plan_date', opts.planDate)
    .not('run_id', 'is', null)
    .limit(1)
  runId = (jobs?.[0]?.run_id as string | undefined) ?? runId

  // A day where some sources gave up is 'partial' and says so on the health
  // page. It is not reported as a success.
  const outcome: 'success' | 'partial' = queue.failed > 0 || !isQueueComplete(queue) ? 'partial' : 'success'
  await finishPipelineRun(db, runId, outcome, {
    plan_date: opts.planDate,
    sources_total: queue.total,
    sources_done: queue.done,
    sources_failed: queue.failed,
    sources_unfinished: queue.pending + queue.running,
    discharge_parents_resolved: dischargeParentsResolved,
    discharge_newly_stale: newlyStale.length,
    discharge_alerts_sent: dischargeAlertsSent,
    forced: Boolean(opts.force),
  })

  if (queue.failed > 0) {
    await logPipelineEvent(db, {
      runId, job: 'ingest', stage: 'finalise', severity: 'warning',
      message: `${queue.failed} source${queue.failed === 1 ? '' : 's'} did not complete today; tomorrow's run recovers their missed window`,
    })
  }

  return {
    finalised: true,
    outcome,
    runId,
    dischargeParentsResolved,
    dischargeNewlyStale: newlyStale.length,
    dischargeAlertsSent,
    digest,
    locationDigest,
    queue,
  }
}
