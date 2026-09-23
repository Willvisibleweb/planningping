// Ingest health, as a status code.
//
// Exists so a free external uptime monitor (UptimeRobot, cron-job.org, Better
// Stack — any of them) can watch the ingest without depending on Vercel's
// scheduler, which is the component that failed. A monitor that lives outside
// the system being monitored is the only kind that can report on the system
// being down.
//
// 200 when fresh, 503 when stale, because that is the one convention every
// uptime monitor already understands. No configuration, no webhook, no parsing
// a JSON body: point it at this URL and it emails when the colour changes.
//
// Deliberately unauthenticated. It exposes how many tracked areas exist and how
// long since the last fetch — operational facts about our own pipeline, not
// anybody's data — and requiring a secret would mean putting that secret into a
// third-party monitor, which is a worse trade than publishing two integers.

import { NextResponse } from 'next/server'
import { getGlobalIngestFreshness, STALE_AFTER_HOURS } from '@/lib/health/ingestFreshness'
import { loadHealthReport } from '@/lib/reliability/healthReport'
import { ingestPlanDate, loadQueueProgress } from '@/lib/ingest/ingestQueueStore'
import { createAdminClient } from '@/lib/supabase/admin'

// Never cached: a cached health check reports the health of the past.
export const dynamic = 'force-dynamic'

// Beyond freshness, this now fails when any source is in the failed state or
// the daily ingest has not started for over 26 hours — the two conditions a
// customer would otherwise be first to notice. Still only counts: no source
// names, errors or customer data leave through an unauthenticated endpoint.
export async function GET() {
  try {
    const db = createAdminClient()
    const planDate = ingestPlanDate()
    const [health, report, queue] = await Promise.all([
      getGlobalIngestFreshness(),
      loadHealthReport(db),
      loadQueueProgress(db, planDate),
    ])

    // A source that gave up for the day is the condition this check most needs
    // to catch, and the one it used to miss: the old ingest lost the back half
    // of its territory list to rate limiting most mornings while this endpoint
    // reported 'ok', because every source it DID reach looked healthy. Judging
    // the day's queue rather than only the sources that ran is what makes the
    // green light mean "everyone got their data".
    const gaveUp = queue.failed > 0
    // Judged on tracked territories, not on the national council backfill. The
    // backfill meets 418 authorities a batch at a time and a first contact
    // routinely answers 429, which reads as a failed source — true, but not an
    // outage, and counting it here kept the endpoint at 503 for as long as
    // coverage kept growing. A monitor that is always red tells you nothing.
    const failing =
      report.available && (report.territoryCounts.failed > 0 || report.ingestOverdue || report.stuckRuns.length > 0)
    const status = health.stale ? 'stale' : failing || gaveUp ? 'degraded' : 'ok'

    return NextResponse.json(
      {
        status,
        hoursSinceLastFetch: health.hoursSinceFetch,
        staleAreas: health.staleAreas,
        totalAreas: health.totalAreas,
        thresholdHours: STALE_AFTER_HOURS,
        // Both are reported: territories decide the status code, the total is
        // there so expanding coverage is still visible to anyone reading it.
        sources: report.available ? report.territoryCounts : null,
        allSources: report.available ? report.counts : null,
        ingestOverdue: report.available ? report.ingestOverdue : null,
        unfinishedRuns: report.available ? report.stuckRuns.length : null,
        // Today's queue, so a monitor can tell "still working through it" from
        // "finished, but some territories were never fetched".
        queue: { date: planDate, ...queue },
        checkedAt: new Date().toISOString(),
      },
      { status: status === 'ok' ? 200 : 503 },
    )
  } catch {
    // A check that cannot run is not a pass. Returning 200 here would mean a
    // database outage reads as healthy, which is the exact failure this route
    // exists to catch.
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }
}
