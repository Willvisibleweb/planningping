// Private health alarm endpoint.
//
// This complements /api/health/ingest. The public endpoint is designed for
// external uptime monitors; this route sends richer admin email alerts and
// writes an audit event, so it stays behind CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { runHealthAlertCheck } from '@/lib/reliability/healthAlerts'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const result = await runHealthAlertCheck({
    dryRun: params.get('dry') === '1',
    force: params.get('force') === '1',
  })

  return NextResponse.json(result, { status: result.status === 'error' ? 500 : 200 })
}
