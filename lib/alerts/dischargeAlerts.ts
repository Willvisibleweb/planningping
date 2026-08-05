// Discharge-of-condition alerts — a second, independent fan-out alongside
// sendBatchedAlerts() in app/api/cron/ingest/route.ts. Different attribution
// axis: area-based alerts match new applications against tracked_areas
// (radius + relevance filter); this matches discharge applications against
// tracked_leads (a specific permission a user is pursuing), since a user can
// be tracking a lead in a council they've since stopped tracking as an area.
//
// Reuses the EXISTING send path (sendAlertEmail from lib/email.ts) rather
// than building a parallel one — only the matching/dedup logic here is new.

import { hasProAccess } from '@/lib/access'
import { sendAlertEmail, type AlertItem } from '@/lib/email'
import type { Profile } from '@/types/database'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { NewApplication } from '@/lib/ingest/upsertApplications'
import type { StaleDischargeRow } from '@/lib/ingest/flagStaleDischarges'

type AdminClient = ReturnType<typeof createAdminClient>

interface DischargeCandidate {
  id: string
  kind: 'new_match' | 'stale'
  parentApplicationId: string | null
  councilSlug: string
  reference: string
  description: string | null
  address: string | null
}

// Discharge applications are excluded from civils-relevance scoring by
// design (see lib/scoring/civilsCriteria.ts's non_build exclusion group), so
// their own `band` would misleadingly render as COLD here — that's a
// scoring signal for a different purpose, not a judgement on whether this
// alert matters. The note line carries the real meaning instead.
const STALE_WEEKS = Number(process.env.DISCHARGE_STALE_WEEKS) || 8

export async function sendDischargeAlerts(
  supabase: AdminClient,
  opts: {
    newApplications: NewApplication[]
    staleRows: StaleDischargeRow[]
    siteUrl: string
  },
): Promise<number> {
  // New discharge rows from this run — re-fetch by id to pick up
  // parent_application_id, which resolveDischargeParents() only just wrote
  // (upsertApplications only ever stores the raw, unresolved reference).
  const newDischargeIds = opts.newApplications
    .filter((a) => a.application_type === 'discharge_of_condition' && a.id)
    .map((a) => a.id as string)

  let newCandidates: DischargeCandidate[] = []
  if (newDischargeIds.length > 0) {
    const { data } = await supabase
      .from('planning_applications')
      .select('id, parent_application_id, council_slug, reference, description, address')
      .in('id', newDischargeIds)
    newCandidates = ((data ?? []) as {
      id: string; parent_application_id: string | null; council_slug: string
      reference: string; description: string | null; address: string | null
    }[]).map((r) => ({
      id: r.id, kind: 'new_match', parentApplicationId: r.parent_application_id,
      councilSlug: r.council_slug, reference: r.reference, description: r.description, address: r.address,
    }))
  }

  const staleCandidates: DischargeCandidate[] = opts.staleRows.map((r) => ({
    id: r.id, kind: 'stale', parentApplicationId: r.parent_application_id,
    councilSlug: r.council_slug, reference: r.reference, description: r.description, address: r.address,
  }))

  const candidates = [...newCandidates, ...staleCandidates].filter((c) => c.parentApplicationId !== null)
  if (candidates.length === 0) return 0

  const parentIds = [...new Set(candidates.map((c) => c.parentApplicationId as string))]
  const { data: leads } = await supabase
    .from('tracked_leads')
    .select('id, user_id, application_id, reference')
    .in('application_id', parentIds)
  const leadsByParent = new Map<string, { id: string; user_id: string; reference: string }[]>()
  for (const lead of (leads ?? []) as { id: string; user_id: string; application_id: string; reference: string }[]) {
    const list = leadsByParent.get(lead.application_id) ?? []
    list.push({ id: lead.id, user_id: lead.user_id, reference: lead.reference })
    leadsByParent.set(lead.application_id, list)
  }
  if (leadsByParent.size === 0) return 0

  // user_id -> { item, logRow }[]
  const hitsByUser = new Map<
    string,
    { item: AlertItem; logRow: { user_id: string; tracked_lead_id: string; discharge_application_id: string; kind: string } }[]
  >()

  for (const candidate of candidates) {
    const matchedLeads = leadsByParent.get(candidate.parentApplicationId as string)
    if (!matchedLeads) continue
    for (const lead of matchedLeads) {
      const note = candidate.kind === 'new_match'
        ? `Discharge of condition submitted against your tracked application ${lead.reference}`
        : `No decision after ${STALE_WEEKS} weeks — check the council portal`
      const item: AlertItem = {
        areaLabel: `Tracked: ${lead.reference}`,
        reference: candidate.reference,
        band: null,
        description: candidate.description,
        address: candidate.address,
        councilSlug: candidate.councilSlug,
        kind: candidate.kind === 'new_match' ? 'discharge_match' : 'discharge_stale',
        note,
      }
      const list = hitsByUser.get(lead.user_id) ?? []
      list.push({
        item,
        logRow: {
          user_id: lead.user_id,
          tracked_lead_id: lead.id,
          discharge_application_id: candidate.id,
          kind: candidate.kind,
        },
      })
      hitsByUser.set(lead.user_id, list)
    }
  }
  if (hitsByUser.size === 0) return 0

  const userIds = [...hitsByUser.keys()]
  const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds)
  const profileById = new Map((profiles ?? []).map((p) => [(p as Profile).id, p as Profile]))

  let sentCount = 0
  const logRows: { user_id: string; tracked_lead_id: string; discharge_application_id: string; kind: string }[] = []

  for (const [userId, hits] of hitsByUser) {
    const profile = profileById.get(userId) ?? null
    if (!hasProAccess(profile)) continue

    const items = hits.map((h) => h.item)
    const sent = await sendAlertEmail({ to: profile!.email, items, siteUrl: opts.siteUrl })
    if (!sent) continue

    sentCount++
    for (const h of hits) logRows.push(h.logRow)
  }

  if (logRows.length > 0) {
    await supabase
      .from('discharge_alert_log')
      .upsert(logRows, { onConflict: 'tracked_lead_id,discharge_application_id,kind', ignoreDuplicates: true })
  }

  return sentCount
}
