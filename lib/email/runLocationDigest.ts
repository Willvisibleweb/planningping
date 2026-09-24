// The weekly job behind the location pages' email capture.
//
// Groups live subscribers by the place they asked about, gathers that place's
// civils-relevant applications for the week, and sends one email each. A place
// with nothing relevant sends nothing — an empty digest is worse than silence,
// and these people are not customers yet.
//
// Idempotent by period. last_sent_at holds the end of the week a subscriber was
// last sent, so re-running the job cannot send the same issue twice, and
// someone who subscribed mid-week does not receive the issue that went out
// before they existed.

import { sendLocationDigest, type LocationDigestItem } from '@/lib/email/locationDigest'
import { locationWindow, relevantForDigest, type LocationKey } from '@/lib/email/locationDigestPlan'
import type { SupabaseClient } from '@supabase/supabase-js'

type Db = SupabaseClient

interface SubscriberRow {
  id: string
  email: string
  location_slug: string
  location_type: 'council' | 'postcode' | 'town'
  last_sent_at: string | null
}

interface AppRow {
  reference: string
  council_slug: string
  address: string | null
  description: string | null
  band: string | null
  application_date: string | null
}

export interface LocationDigestResult {
  ran_at: string
  period: { start: string; end: string }
  subscribers: number
  places: number
  sent: number
  skipped_already_sent: number
  skipped_nothing_relevant: number
  failed: number
  dry_run?: boolean
}

/** Where a place's page lives, for the "see everything" link. */
function placePath(key: LocationKey, parentSlug: string | null): string {
  if (key.type === 'council') return `/planning-applications/${key.slug}`
  if (key.type === 'postcode') return `/planning-applications/postcode/${key.slug}`
  return `/planning-applications/${parentSlug ?? ''}/${key.slug}`
}

export async function runLocationDigest(
  db: Db,
  opts: { siteUrl: string; now?: Date; dryRun?: boolean; force?: boolean } = { siteUrl: '' },
): Promise<LocationDigestResult> {
  const { start, end } = locationWindow(opts.now ?? new Date())
  const result: LocationDigestResult = {
    ran_at: new Date().toISOString(),
    period: { start, end },
    subscribers: 0,
    places: 0,
    sent: 0,
    skipped_already_sent: 0,
    skipped_nothing_relevant: 0,
    failed: 0,
    ...(opts.dryRun ? { dry_run: true } : {}),
  }

  const { data: subs, error } = await db
    .from('location_subscriptions')
    .select('id, email, location_slug, location_type, last_sent_at')
    .is('unsubscribed_at', null)
  if (error) throw new Error(`location_subscriptions read failed: ${error.message}`)

  const subscribers = (subs ?? []) as SubscriberRow[]
  result.subscribers = subscribers.length
  if (subscribers.length === 0) return result

  // One query per distinct place, not per subscriber.
  const byPlace = new Map<string, { key: LocationKey; rows: SubscriberRow[] }>()
  for (const s of subscribers) {
    const key: LocationKey = { type: s.location_type, slug: s.location_slug }
    const id = `${key.type}:${key.slug}`
    const entry = byPlace.get(id) ?? { key, rows: [] }
    entry.rows.push(s)
    byPlace.set(id, entry)
  }
  result.places = byPlace.size

  for (const { key, rows } of byPlace.values()) {
    const due = opts.force ? rows : rows.filter((r) => !r.last_sent_at || r.last_sent_at < end)
    result.skipped_already_sent += rows.length - due.length
    if (due.length === 0) continue

    // The place's own name and parent, for the heading and the link.
    const { data: loc } = await db
      .from('seo_locations')
      .select('name, parent_slug')
      .eq('tier', key.type)
      .eq('slug', key.slug)
      .maybeSingle()
    const placeName = (loc as { name?: string } | null)?.name ?? key.slug
    const parentSlug = (loc as { parent_slug?: string | null } | null)?.parent_slug ?? null

    let query = db
      .from('planning_applications')
      .select('reference, council_slug, address, description, band, application_date')
      .gte('application_date', start)
      .lte('application_date', end)
      .order('application_date', { ascending: false })
      .limit(200)

    if (key.type === 'council') query = query.eq('council_slug', key.slug)
    else if (key.type === 'postcode') query = query.eq('postcode_district', key.slug.toUpperCase())
    else query = query.eq('council_slug', parentSlug ?? '').ilike('address', `%, ${placeName}, %`)

    const { data: apps } = await query
    const all = (apps ?? []) as AppRow[]
    const relevant = all.filter((a) => relevantForDigest(a.band))

    if (relevant.length === 0) {
      result.skipped_nothing_relevant += due.length
      continue
    }

    const items: LocationDigestItem[] = relevant.slice(0, 12).map((a) => ({
      reference: a.reference,
      councilSlug: a.council_slug,
      address: a.address,
      description: a.description,
      band: a.band,
    }))

    for (const sub of due) {
      if (opts.dryRun) { result.sent++; continue }
      const ok = await sendLocationDigest(
        {
          to: sub.email,
          subscriptionId: sub.id,
          placeName,
          placePath: placePath(key, parentSlug),
          items,
          filteredOut: all.length - relevant.length,
          periodStart: start,
          periodEnd: end,
        },
        opts.siteUrl,
      )
      if (!ok) { result.failed++; continue }

      // Stamped only after Resend accepted it, so a failure is retried rather
      // than silently counted as delivered.
      await db.from('location_subscriptions').update({ last_sent_at: end }).eq('id', sub.id)
      result.sent++
    }
  }

  return result
}
