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

// Never cached: a cached health check reports the health of the past.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const health = await getGlobalIngestFreshness()

    return NextResponse.json(
      {
        status: health.stale ? 'stale' : 'ok',
        hoursSinceLastFetch: health.hoursSinceFetch,
        staleAreas: health.staleAreas,
        totalAreas: health.totalAreas,
        thresholdHours: STALE_AFTER_HOURS,
        checkedAt: new Date().toISOString(),
      },
      { status: health.stale ? 503 : 200 },
    )
  } catch {
    // A check that cannot run is not a pass. Returning 200 here would mean a
    // database outage reads as healthy, which is the exact failure this route
    // exists to catch.
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }
}
