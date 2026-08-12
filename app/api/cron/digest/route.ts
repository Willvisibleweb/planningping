// Weekly digest — runs Monday 06:00 via Vercel Cron (see vercel.json).
//
// Replaces the n8n workflow that used to do this. That workflow lived on a
// separate host and was welded to the old scraper; when the scraper moved here
// the digest went with it and nothing has sent a digest since. Keeping it in
// the repo means it is typechecked, reviewed and deployed with everything else.
//
// Everyone with an active tracked area gets one, homeowners included — the
// free tier is sold on "a weekly email digest", and the alert path in
// cron/ingest is gated on paid access, so a homeowner otherwise receives
// nothing at all.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendDigestEmail, type DigestItem, type DigestPayload } from '@/lib/email/digestEmail'
import type { MinBand } from '@/types/database'

export const maxDuration = 300

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://planningping.com'

interface AreaRow {
  user_id: string
  label: string | null
  postcode: string
  council_slug: string
  min_band: MinBand
}

interface AppRow {
  id: string
  council_slug: string
  reference: string
  description: string | null
  address: string | null
  status: string | null
  application_date: string | null
  band: string | null
}

// Mirrors filterByBand in components/dashboard/TrackedAreasList.tsx, so the
// digest and the dashboard agree on what counts as relevant for an area.
function clearsBand(band: string | null, minBand: MinBand): boolean {
  if (minBand === 'WARM_PLUS') return band === 'HOT' || band === 'WARM'
  if (minBand === 'HOT_ONLY') return band === 'HOT'
  return true
}

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

  // The seven whole days ending yesterday. Running at 06:00 Monday that means
  // last Monday through Sunday — always a complete week, and re-running it the
  // same day can't shift the window or double-count.
  const today = new Date()
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 7)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const periodStart = iso(start)
  const periodEnd = iso(new Date(end.getTime() - 86400000))

  const { data: areas, error: areasError } = await supabase
    .from('tracked_areas')
    .select('user_id, label, postcode, council_slug, min_band')
    .eq('is_active', true)
  if (areasError) return NextResponse.json({ error: areasError.message }, { status: 500 })

  const areaRows = (areas ?? []) as AreaRow[]
  if (areaRows.length === 0) {
    return NextResponse.json({ ran_at: new Date().toISOString(), recipients: 0, sent: 0 })
  }

  const userIds = [...new Set(areaRows.map((a) => a.user_id))]
  const councilSlugs = [...new Set(areaRows.map((a) => a.council_slug))]

  const [{ data: profiles }, { data: apps }, { data: recentDigests }] = await Promise.all([
    supabase.from('profiles').select('id, email').in('id', userIds),
    supabase
      .from('planning_applications')
      .select('id, council_slug, reference, description, address, status, application_date, band')
      .in('council_slug', councilSlugs)
      .gte('application_date', periodStart)
      .lte('application_date', periodEnd)
      .order('application_date', { ascending: false }),
    // Skip anyone who already has a digest for exactly THIS window.
    //
    // This used to test for any overlap (period_end >= periodStart) on the
    // reasoning that weekly windows never overlap. They don't — but only if
    // every send lands on a Monday. A manual send on 6 Aug covering
    // 30 Jul-5 Aug overlapped the 3-9 Aug window, so the following Monday's
    // real digest was skipped for every user. A one-off test silently
    // cancelled a scheduled send.
    //
    // Matching the exact window is what was actually wanted: a retry computes
    // the same window and is blocked, while any later run computes a different
    // one and goes out. A stray send can no longer poison the weeks after it.
    supabase
      .from('digests')
      .select('user_id, period_start, period_end')
      .in('user_id', userIds)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd),
  ])

  const emailById = new Map(
    ((profiles ?? []) as { id: string; email: string }[]).map((p) => [p.id, p.email]),
  )

  const alreadySent = new Set(
    ((recentDigests ?? []) as { user_id: string }[]).map((d) => d.user_id),
  )

  const byCouncil = new Map<string, AppRow[]>()
  for (const a of (apps ?? []) as AppRow[]) {
    const list = byCouncil.get(a.council_slug) ?? []
    list.push(a)
    byCouncil.set(a.council_slug, list)
  }

  const payloads: DigestPayload[] = []
  let skippedAsDuplicate = 0

  for (const userId of userIds) {
    const email = emailById.get(userId)
    if (!email) continue

    if (alreadySent.has(userId) && !force) {
      skippedAsDuplicate++
      continue
    }

    const myAreas = areaRows.filter((a) => a.user_id === userId)
    // An application can sit in two areas that share a council. First area to
    // claim it wins, so it's listed once and attributed somewhere sensible.
    const seen = new Set<string>()
    const items: DigestItem[] = []

    for (const area of myAreas) {
      for (const app of byCouncil.get(area.council_slug) ?? []) {
        if (seen.has(app.id)) continue
        if (!clearsBand(app.band, area.min_band)) continue
        seen.add(app.id)
        items.push({
          applicationId: app.id,
          reference: app.reference,
          description: app.description,
          address: app.address,
          status: app.status,
          applicationDate: app.application_date,
          band: app.band,
          areaLabel: area.label || area.postcode,
        })
      }
    }

    if (items.length === 0) continue // nothing to say — send nothing

    // Best first: HOT, then most recent.
    const rank: Record<string, number> = { HOT: 0, WARM: 1, COLD: 2 }
    items.sort((a, b) => {
      const r = (rank[a.band ?? ''] ?? 3) - (rank[b.band ?? ''] ?? 3)
      if (r !== 0) return r
      return String(b.applicationDate ?? '').localeCompare(String(a.applicationDate ?? ''))
    })

    payloads.push({
      userId,
      email,
      periodStart,
      periodEnd,
      areaCount: myAreas.length,
      items,
    })
  }

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      forced: force,
      period: { start: periodStart, end: periodEnd },
      recipients: payloads.length,
      skipped_already_sent: skippedAsDuplicate,
      would_send: payloads.map((p) => ({ email: p.email, applications: p.items.length, areas: p.areaCount })),
    })
  }

  let sent = 0
  const failures: string[] = []

  for (const payload of payloads) {
    const ok = await sendDigestEmail(payload, SITE_URL)
    if (!ok) {
      failures.push(payload.email)
      continue
    }
    sent++
    // Recorded only after Resend accepts it, so Settings → Digest history
    // reflects what was actually delivered rather than what was attempted.
    await supabase.from('digests').insert({
      user_id: payload.userId,
      period_start: payload.periodStart,
      period_end: payload.periodEnd,
      application_count: payload.items.length,
      summary: `${payload.items.length} new application${payload.items.length === 1 ? '' : 's'}`,
    })
  }

  return NextResponse.json({
    ran_at: new Date().toISOString(),
    forced: force,
    period: { start: periodStart, end: periodEnd },
    recipients: payloads.length,
    skipped_already_sent: skippedAsDuplicate,
    sent,
    failed: failures.length,
  })
}
