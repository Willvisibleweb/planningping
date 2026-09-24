// The Monday digest.
//
// Deliberately NOT gated on hasProAccess, unlike every other email we send.
// Alerts, decisions and discharge notices are all Pro-only; this one goes to
// anyone with an active territory, free accounts included. That is a product
// decision, confirmed 24 Sep 2026 — the digest is the reason a free user comes
// back, so putting it behind the paywall would remove the thing most likely to
// turn them into a paying one.
//
// So if you are here because the gating looks inconsistent with the other
// senders: it is inconsistent, and on purpose. Do not "fix" it.

import { sendDigestEmail, type DigestItem, type DigestPayload } from '@/lib/email/digestEmail'
import type { MinBand } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'
import { canEmail } from '@/lib/email/unsubscribe'

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

export interface WeeklyDigestResult {
  ran_at: string
  forced: boolean
  period: { start: string; end: string }
  recipients: number
  skipped_already_sent: number
  sent?: number
  failed?: number
  would_send?: { email: string; applications: number; areas: number }[]
}

// Mirrors filterByBand in components/dashboard/TrackedAreasList.tsx, so the
// digest and the dashboard agree on what counts as relevant for an area.
function clearsBand(band: string | null, minBand: MinBand): boolean {
  if (minBand === 'WARM_PLUS') return band === 'HOT' || band === 'WARM'
  if (minBand === 'HOT_ONLY') return band === 'HOT'
  return true
}

export async function runWeeklyDigest(
  supabase: SupabaseClient,
  opts: {
    dryRun?: boolean
    force?: boolean
    siteUrl?: string
    now?: Date
  } = {},
): Promise<WeeklyDigestResult> {
  const dryRun = opts.dryRun ?? false
  const force = opts.force ?? false

  // The seven whole days ending yesterday. Running at 06:00 Monday means last
  // Monday through Sunday: a complete week, stable across retries.
  const today = opts.now ?? new Date()
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
  if (areasError) throw areasError

  const areaRows = (areas ?? []) as AreaRow[]
  if (areaRows.length === 0) {
    return {
      ran_at: new Date().toISOString(),
      forced: force,
      period: { start: periodStart, end: periodEnd },
      recipients: 0,
      skipped_already_sent: 0,
      sent: dryRun ? undefined : 0,
      failed: dryRun ? undefined : 0,
    }
  }

  const userIds = [...new Set(areaRows.map((a) => a.user_id))]
  const councilSlugs = [...new Set(areaRows.map((a) => a.council_slug))]

  const [{ data: profiles }, { data: apps }, { data: recentDigests }] = await Promise.all([
    supabase.from('profiles').select('id, email, emails_unsubscribed_at').in('id', userIds),
    supabase
      .from('planning_applications')
      .select('id, council_slug, reference, description, address, status, application_date, band')
      .in('council_slug', councilSlugs)
      .gte('application_date', periodStart)
      .lte('application_date', periodEnd)
      .order('application_date', { ascending: false }),
    supabase
      .from('digests')
      .select('user_id, period_start, period_end')
      .in('user_id', userIds)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd),
  ])

  // Unsubscribed users are left out here, so they never reach a payload —
  // not in a real send and not in a dry run's would_send list either.
  const emailById = new Map(
    ((profiles ?? []) as { id: string; email: string; emails_unsubscribed_at: string | null }[])
      .filter((p) => canEmail(p))
      .map((p) => [p.id, p.email]),
  )

  const alreadySent = new Set(
    ((recentDigests ?? []) as { user_id: string }[]).map((d) => d.user_id),
  )

  const byCouncil = new Map<string, AppRow[]>()
  for (const app of (apps ?? []) as AppRow[]) {
    const list = byCouncil.get(app.council_slug) ?? []
    list.push(app)
    byCouncil.set(app.council_slug, list)
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

    if (items.length === 0) continue

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
    return {
      ran_at: new Date().toISOString(),
      forced: force,
      period: { start: periodStart, end: periodEnd },
      recipients: payloads.length,
      skipped_already_sent: skippedAsDuplicate,
      would_send: payloads.map((p) => ({
        email: p.email,
        applications: p.items.length,
        areas: p.areaCount,
      })),
    }
  }

  let sent = 0
  const failures: string[] = []

  for (const payload of payloads) {
    const ok = await sendDigestEmail(payload, opts.siteUrl ?? SITE_URL)
    if (!ok) {
      failures.push(payload.email)
      continue
    }
    sent++
    await supabase.from('digests').insert({
      user_id: payload.userId,
      period_start: payload.periodStart,
      period_end: payload.periodEnd,
      application_count: payload.items.length,
      summary: `${payload.items.length} new application${payload.items.length === 1 ? '' : 's'}`,
    })
  }

  return {
    ran_at: new Date().toISOString(),
    forced: force,
    period: { start: periodStart, end: periodEnd },
    recipients: payloads.length,
    skipped_already_sent: skippedAsDuplicate,
    sent,
    failed: failures.length,
  }
}
