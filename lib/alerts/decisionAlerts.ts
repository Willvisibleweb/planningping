// Decision alerts — a third fan-out alongside sendBatchedAlerts() and
// sendDischargeAlerts() in app/api/cron/ingest/route.ts.
//
// Attribution is deliberately wider than the other two. An application is
// relevant here if the user tracks the area it's in OR is pursuing it as a
// lead — because a decision on something you put in your pipeline matters even
// if you've since stopped watching that territory, and a decision in your
// patch matters even if you never tracked that specific application.
//
// Business-first, per the product's buyer:
//   - Gated on hasProAccess, like the other alert paths.
//   - min_band is NOT applied. A COLD-scored application that just got consent
//     is still a live site; the relevance filter exists to keep the browsing
//     feed quiet, and a decision isn't browsing.
//   - Refusals and withdrawals alert too. Knowing a pursuit is dead is worth
//     as much to a BD lead as knowing one is live.

import { hasProAccess } from '@/lib/access'
import { getUserFeatures } from '@/lib/features'
import { sendDecisionEmail, type DecisionItem } from '@/lib/email/decisionEmail'
import type { Profile } from '@/types/database'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { DecidedApplication } from '@/lib/ingest/upsertApplications'

type AdminClient = ReturnType<typeof createAdminClient>

export async function sendDecisionAlerts(
  supabase: AdminClient,
  opts: { decided: DecidedApplication[]; siteUrl: string },
): Promise<number> {
  const decided = opts.decided.filter((d) => d.id !== null)
  if (decided.length === 0) return 0

  const councilSlugs = [...new Set(decided.map((d) => d.council_slug))]
  const applicationIds = decided.map((d) => d.id as string)

  // Two independent routes to a recipient, resolved in parallel.
  const [{ data: areas }, { data: leads }] = await Promise.all([
    supabase
      .from('tracked_areas')
      .select('user_id, label, postcode, council_slug')
      .eq('is_active', true)
      .in('council_slug', councilSlugs),
    supabase.from('tracked_leads').select('user_id, application_id').in('application_id', applicationIds),
  ])

  const areasByCouncil = new Map<string, { user_id: string; label: string }[]>()
  for (const a of (areas ?? []) as {
    user_id: string
    label: string | null
    postcode: string
    council_slug: string
  }[]) {
    const list = areasByCouncil.get(a.council_slug) ?? []
    list.push({ user_id: a.user_id, label: a.label || a.postcode })
    areasByCouncil.set(a.council_slug, list)
  }

  const leadUsersByApp = new Map<string, string[]>()
  for (const l of (leads ?? []) as { user_id: string; application_id: string }[]) {
    const list = leadUsersByApp.get(l.application_id) ?? []
    list.push(l.user_id)
    leadUsersByApp.set(l.application_id, list)
  }

  // user_id -> items. A Set of application ids per user prevents the same
  // decision being listed twice when a user both tracks the area and holds
  // the lead.
  const itemsByUser = new Map<string, DecisionItem[]>()
  const seenByUser = new Map<string, Set<string>>()

  function add(userId: string, item: DecisionItem, appId: string) {
    const seen = seenByUser.get(userId) ?? new Set<string>()
    if (seen.has(appId)) return
    seen.add(appId)
    seenByUser.set(userId, seen)
    const list = itemsByUser.get(userId) ?? []
    list.push(item)
    itemsByUser.set(userId, list)
  }

  for (const d of decided) {
    const appId = d.id as string
    const base = {
      applicationId: appId,
      reference: d.reference,
      outcome: d.outcome,
      description: d.description,
      address: d.address,
      councilSlug: d.council_slug,
      decisionDate: d.decision_date,
    }

    // Pipeline first, so its label wins for anyone who matches both routes —
    // "you're pursuing this" is more useful context than which territory it
    // happens to sit in.
    for (const userId of leadUsersByApp.get(appId) ?? []) {
      add(userId, { ...base, areaLabel: 'In your pipeline' }, appId)
    }
    for (const area of areasByCouncil.get(d.council_slug) ?? []) {
      add(area.user_id, { ...base, areaLabel: area.label }, appId)
    }
  }

  if (itemsByUser.size === 0) return 0

  const userIds = [...itemsByUser.keys()]
  const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds)
  const profileById = new Map((profiles ?? []).map((p) => [(p as Profile).id, p as Profile]))

  let sentCount = 0
  const alertedAppIds = new Set<string>()

  for (const [userId, items] of itemsByUser) {
    const profile = profileById.get(userId) ?? null
    if (!hasProAccess(profile)) continue

    const features = getUserFeatures(profile)
    const sent = await sendDecisionEmail({
      to: profile!.email,
      items,
      siteUrl: opts.siteUrl,
      partner: features.siteMonitoring ? features.partnershipProvider : null,
    })
    if (!sent) continue

    sentCount++
    for (const i of items) if (i.applicationId) alertedAppIds.add(i.applicationId)
  }

  // Stamp only what was actually delivered. An application nobody could be
  // emailed about stays unstamped, so it will alert if a recipient starts
  // tracking that territory before the status changes again — and a send
  // failure leaves it eligible for the next run rather than silently lost.
  if (alertedAppIds.size > 0) {
    await supabase
      .from('planning_applications')
      .update({ decision_alerted_at: new Date().toISOString() })
      .in('id', [...alertedAppIds])
  }

  return sentCount
}
