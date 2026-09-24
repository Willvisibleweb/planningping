// The alert fan-out for a PlanIt area query.
//
// Lifted out of app/api/cron/ingest/route.ts unchanged when the ingest was
// split into queued per-source jobs, so the worker and the one-shot route send
// exactly the same emails. The attribution seam is the query key: PlanIt's own
// radius search already decided which territories cover an application, so
// there is no distance matching to reimplement here.

import type { createAdminClient } from '@/lib/supabase/admin'
import { hasProAccess } from '@/lib/access'
import { getUserFeatures } from '@/lib/features'
import { sendAlertEmail, type AlertItem } from '@/lib/email'
import { canEmail } from '@/lib/email/unsubscribe'
import type { upsertApplications } from '@/lib/ingest/upsertApplications'
import type { Profile, MinBand } from '@/types/database'

type AdminClient = ReturnType<typeof createAdminClient>
type NewApplications = Awaited<ReturnType<typeof upsertApplications>>['new_applications']

export interface AreaRow {
  id: string
  user_id: string
  postcode: string
  radius_metres: number | null
  alerts_enabled: boolean
  min_band: MinBand
  label: string
  council_slug: string
  last_planit_fetch_at: string | null
}

/** Does this application's band clear the territory's relevance filter? */
export function clearsBand(band: string | null, minBand: MinBand): boolean {
  if (minBand === 'ALL') return true
  if (minBand === 'WARM_PLUS') return band === 'HOT' || band === 'WARM'
  return band === 'HOT' // HOT_ONLY
}

/**
 * For every genuinely new application, find every tracked_area that actually
 * surfaced it, gate through alerts_enabled / relevance filter / pro access /
 * dedup, then send one batched email per user covering everything they qualify
 * for. Returns the number of emails sent.
 */
export async function sendBatchedAlerts(
  supabase: AdminClient,
  opts: {
    queryKeyToAreas: Map<string, AreaRow[]>
    queryKeyToApps: Map<string, { council_slug: string; reference: string }[]>
    newApplications: NewApplications
    siteUrl: string
  },
): Promise<number> {
  const newByKey = new Map(opts.newApplications.map((a) => [`${a.council_slug}|${a.reference}`, a]))
  if (newByKey.size === 0) return 0

  // user_id -> { area, item }[] — everything this user qualifies for this run.
  const hitsByUser = new Map<string, { area: AreaRow; item: AlertItem }[]>()

  for (const [queryKey, areasForKey] of opts.queryKeyToAreas) {
    const apps = opts.queryKeyToApps.get(queryKey) ?? []
    for (const alertArea of areasForKey) {
      if (!alertArea.alerts_enabled) continue
      for (const app of apps) {
        const newApp = newByKey.get(`${app.council_slug}|${app.reference}`)
        if (!newApp) continue
        if (!clearsBand(newApp.band, alertArea.min_band)) continue
        const list = hitsByUser.get(alertArea.user_id) ?? []
        list.push({
          area: alertArea,
          item: {
            areaLabel: alertArea.label,
            reference: newApp.reference,
            band: newApp.band,
            description: newApp.description,
            address: newApp.address,
            councilSlug: newApp.council_slug,
          },
        })
        hitsByUser.set(alertArea.user_id, list)
      }
    }
  }
  if (hitsByUser.size === 0) return 0

  const userIds = [...hitsByUser.keys()]
  const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds)
  const profileById = new Map((profiles ?? []).map((p) => [(p as Profile).id, p as Profile]))

  let sentCount = 0
  const logRows: { user_id: string; tracked_area_id: string; council_slug: string; reference: string }[] = []

  for (const [userId, hits] of hitsByUser) {
    const profile = profileById.get(userId) ?? null
    if (!hasProAccess(profile)) continue
    if (!canEmail(profile)) continue

    const items = hits.map((h) => h.item)
    // Partner suggestions are opt-in and per-account. Resolved here from the
    // profile rather than inside the email builder, so there is exactly one
    // place that decides whether someone is in a partner network — the same
    // getUserFeatures the UI uses.
    const features = getUserFeatures(profile)
    const sent = await sendAlertEmail({
      to: profile!.email,
      userId,
      items,
      siteUrl: opts.siteUrl,
      partner: features.siteMonitoring ? features.partnershipProvider : null,
    })
    if (!sent) continue

    sentCount++
    for (const h of hits) {
      logRows.push({
        user_id: userId,
        tracked_area_id: h.area.id,
        council_slug: h.item.councilSlug,
        reference: h.item.reference,
      })
    }
  }

  if (logRows.length > 0) {
    await supabase
      .from('email_alert_log')
      .upsert(logRows, { onConflict: 'tracked_area_id,council_slug,reference', ignoreDuplicates: true })
  }

  return sentCount
}
