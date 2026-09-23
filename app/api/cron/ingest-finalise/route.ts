// Step 3 of 3: the work that happens once a day, after the sources are in.
//
// The logic lives in lib/ingest/finaliseIngestDay.ts because the one-shot
// /api/cron/ingest has to be able to do it too: on a Vercel Hobby plan there
// are only two cron slots, so this route is not always the thing that closes
// the day.
//
// In the old single-function ingest this work sat at the bottom of the loop,
// which meant that on any day the loop ran out of time it silently did not
// happen — the Monday digest included.
//
// Answers 202 immediately and works in the background; ?wait=1 blocks for the
// real result, which the GitHub Actions guard job needs so it can read the
// queue total. See lib/api/backgroundCron.ts.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runHealthAlertCheck } from '@/lib/reliability/healthAlerts'
import { ingestPlanDate } from '@/lib/ingest/ingestQueueStore'
import { finaliseIngestDay } from '@/lib/ingest/finaliseIngestDay'
import { isAuthorisedCron, respondInBackground } from '@/lib/api/backgroundCron'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://planningping.com'

export async function GET(request: NextRequest) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const planDate = params.get('date') ?? ingestPlanDate()
  const force = params.get('force') === '1'

  return respondInBackground(request, { job: 'ingest-finalise' }, () => closeDay(planDate, force))
}

async function closeDay(planDate: string, force: boolean): Promise<Record<string, unknown>> {
  const supabase = createAdminClient()
  const result = await finaliseIngestDay(supabase, { planDate, siteUrl: SITE_URL, force })

  if (!result.finalised) {
    return { ran_at: new Date().toISOString(), plan_date: planDate, ...result }
  }

  const healthAlert = await runHealthAlertCheck({ db: supabase })

  return {
    ran_at: new Date().toISOString(),
    plan_date: planDate,
    ...result,
    health_alert: healthAlert,
  }
}
