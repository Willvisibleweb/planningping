// Step 3 of 3: the work that happens once a day, after the sources are in.
//
// Discharge-of-condition sweeps, the Monday digest and the health alarm all
// need the day's data to be complete-ish before they run. In the old
// single-function ingest they sat at the bottom of the loop, which meant that
// on any day the loop ran out of time they silently did not happen — the
// digest included.
//
// This job is safe to run repeatedly. It refuses to close a run while sources
// are still pending, the digest has its own exact-window guard, and the
// discharge sweep is idempotent.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDischargeParents } from '@/lib/ingest/resolveDischargeParents'
import { flagStaleDischarges } from '@/lib/ingest/flagStaleDischarges'
import { sendDischargeAlerts } from '@/lib/alerts/dischargeAlerts'
import { runWeeklyDigest } from '@/lib/email/runWeeklyDigest'
import { runHealthAlertCheck } from '@/lib/reliability/healthAlerts'
import { finishPipelineRun, logPipelineEvent } from '@/lib/reliability/pipelineLog'
import { ingestPlanDate, loadQueueProgress } from '@/lib/ingest/ingestQueueStore'
import { isQueueComplete } from '@/lib/reliability/ingestQueue'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://planningping.com'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const planDate = params.get('date') ?? ingestPlanDate()
  // The day's queue may legitimately still be draining when this fires. Only
  // --force closes the run early; otherwise we say so and come back.
  const force = params.get('force') === '1'

  const supabase = createAdminClient()
  const queue = await loadQueueProgress(supabase, planDate)

  if (!isQueueComplete(queue) && !force) {
    return NextResponse.json({
      ran_at: new Date().toISOString(),
      plan_date: planDate,
      finalised: false,
      reason: queue.total === 0 ? 'nothing was planned for today' : 'sources still queued',
      queue,
    })
  }

  // Parent-ID resolution runs every day: a discharge row's parent is often
  // ingested later than the discharge itself. Then stale-flagging, then the
  // alert, which reads both.
  const dischargeParentsResolved = await resolveDischargeParents(supabase)
  const newlyStale = await flagStaleDischarges(supabase)
  const dischargeAlertsSent = await sendDischargeAlerts(supabase, {
    newApplications: [],
    staleRows: newlyStale,
    siteUrl: SITE_URL,
  })

  // The digest has its own exact-window guard, so running this job twice on a
  // Monday cannot resend a completed week.
  const digest = new Date().getUTCDay() === 1 ? await runWeeklyDigest(supabase, { siteUrl: SITE_URL }) : null

  // Close the day's run with what the queue actually achieved. A day where
  // some sources gave up is 'partial', and says so on the health page — it is
  // not reported as a success.
  const { data: jobs } = await supabase
    .from('ingest_jobs')
    .select('run_id, result')
    .eq('plan_date', planDate)
    .not('run_id', 'is', null)
    .limit(1)
  const runId = (jobs?.[0]?.run_id as string | undefined) ?? null

  const outcome = queue.failed > 0 || !isQueueComplete(queue) ? 'partial' : 'success'
  await finishPipelineRun(supabase, runId, outcome, {
    plan_date: planDate,
    sources_total: queue.total,
    sources_done: queue.done,
    sources_failed: queue.failed,
    sources_unfinished: queue.pending + queue.running,
    discharge_parents_resolved: dischargeParentsResolved,
    discharge_newly_stale: newlyStale.length,
    discharge_alerts_sent: dischargeAlertsSent,
    forced: force,
  })

  if (queue.failed > 0) {
    await logPipelineEvent(supabase, {
      runId, job: 'ingest', stage: 'finalise', severity: 'warning',
      message: `${queue.failed} source${queue.failed === 1 ? '' : 's'} did not complete today; tomorrow's run recovers their missed window`,
    })
  }

  const healthAlert = await runHealthAlertCheck({ db: supabase })

  return NextResponse.json({
    ran_at: new Date().toISOString(),
    plan_date: planDate,
    finalised: true,
    run_id: runId,
    outcome,
    queue,
    discharge_parents_resolved: dischargeParentsResolved,
    discharge_newly_stale: newlyStale.length,
    discharge_alerts_sent: dischargeAlertsSent,
    digest,
    health_alert: healthAlert,
  })
}
