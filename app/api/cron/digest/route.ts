// Weekly digest — manually callable endpoint and dry-run harness.
//
// The scheduled send now runs from /api/cron/ingest on Mondays. That route is
// already known to fire every day, which makes it a better home than a second
// weekly Vercel schedule that can quietly drift out of view.
//
// Everyone with an active tracked area gets one, homeowners included — the
// free tier is sold on "a weekly email digest", and the alert path in
// cron/ingest is gated on paid access, so a homeowner otherwise receives
// nothing at all.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runWeeklyDigest } from '@/lib/email/runWeeklyDigest'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  // Support a no-send dry run, so this can be checked against real data before
  // it is ever pointed at real inboxes: ?dry=1
  const dryRun = params.get('dry') === '1'
  // Escape hatch for re-testing a copy change within the same week. Behind
  // CRON_SECRET, and deliberately not something the schedule can pass.
  const force = params.get('force') === '1'

  const supabase = createAdminClient()
  try {
    const result = await runWeeklyDigest(supabase, { dryRun, force })
    return NextResponse.json(dryRun ? { dry_run: true, ...result } : result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Digest failed' },
      { status: 500 },
    )
  }
}
