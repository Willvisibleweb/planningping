// The homepage search.
//
// Answers "what is being built near me" for a visitor who has never signed in,
// using data that is already public: public_applications is the view the SEO
// pages read, curated to a safe column set and withholding anything newer than
// seven days so fresh data stays a paid feature. Nothing here widens what is
// exposed — it routes into pages that already exist and already serve this data
// to anonymous crawlers.
//
// Deliberately NOT a new query surface over the whole table. An unauthenticated
// endpoint that will run an arbitrary search is a thing to be abused; this
// resolves free text to one of 183 known locations and reads a handful of rows
// for that one place.

import { createAdminClient } from '@/lib/supabase/admin'
import { positiveSignals, whereReason } from '@/lib/scoring/civilsCriteria'
import { lookupPostcode, postcodeDistrict } from '@/lib/postcodes'
import { getLocationsByTier, type SeoLocation } from '@/lib/seo/locations'
import { councilHref, postcodeHref } from '@/lib/seo/links'
import { POSITIVE_GROUPS } from '@/lib/scoring/civilsCriteria'
import { describeChoices, nearestPostcode, resolvePlace, type PlaceSuggestion } from '@/lib/places'

export interface ScopeOption {
  id: string
  label: string
  /** The exact reason string the scorer writes, for containment matching. */
  reason: string
}

// Built from the scorer's own constants rather than retyped, so a change to a
// group's label or weight moves the filter with it instead of leaving a chip
// that silently matches nothing.
export const SEARCH_SCOPES: ScopeOption[] = POSITIVE_GROUPS.map((g) => ({
  id: g.id,
  label: g.label.replace(/ scope$| works$/, ''),
  reason: `${g.label} (+${g.weight})`,
}))

export interface PreviewOpportunity {
  reference: string
  description: string
  address: string | null
  applicationDate: string | null
  status: string | null
  /** Scope tags derived from the scorer's reasons — the "why we flagged it". */
  scopes: string[]
  councilName: string
}

export type AreaSearchResult =
  | {
      ok: true
      /** What we resolved the query to, for display. */
      placeName: string
      /** Where "view all" should go — an existing public page. */
      href: string
      /** Every application we hold for that place. */
      total: number
      /** How many carry civils scope, the number that actually matters. */
      relevant: number
      preview: PreviewOpportunity[]
    }
  | { ok: false; reason: 'empty' | 'not-found' | 'no-coverage' | 'error'; message: string }

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d?[A-Z]{0,2}$/i

/** Loose match of free text against a location name, for town/city queries. */
function matchByName(locations: SeoLocation[], query: string): SeoLocation | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  return (
    locations.find((l) => l.name.toLowerCase() === q) ??
    locations.find((l) => l.name.toLowerCase().startsWith(q)) ??
    locations.find((l) => l.name.toLowerCase().includes(q)) ??
    null
  )
}

/** Exact name only — the loose match is kept for last, after the place search. */
function matchExactName(locations: SeoLocation[], query: string): SeoLocation | null {
  const q = query.trim().toLowerCase()
  return locations.find((l) => l.name.toLowerCase() === q) ?? null
}

/**
 * Resolve free text to a public location page and preview what is there.
 *
 * Accepts a full postcode, an outward code, or a place name. A postcode is
 * resolved through postcodes.io — already used elsewhere in the app — to find
 * its district and authority, then matched against the pages that actually
 * exist. There is no point routing someone to a page we do not have.
 *
 * A place name ("Alton", "stoke on tret") goes through the place search, which
 * forgives typos and knows every town in Great Britain, not only the 183 we
 * have pages for. The place is turned into the postcode at its centre and then
 * takes exactly the postcode route. `place` is the suggestion the person picked
 * from the dropdown, when they did, so we never re-guess what they chose.
 */
export async function searchArea(
  rawQuery: string,
  scopeId?: string,
  place?: PlaceSuggestion,
): Promise<AreaSearchResult> {
  const query = rawQuery.trim()
  if (!query) {
    return { ok: false, reason: 'empty', message: 'Enter a postcode, town or city.' }
  }
  if (query.length > 60) {
    return { ok: false, reason: 'not-found', message: 'That does not look like a place name.' }
  }

  try {
    const [councils, postcodes, towns] = await Promise.all([
      getLocationsByTier('council'),
      getLocationsByTier('postcode'),
      getLocationsByTier('town'),
    ])

    let location: SeoLocation | null = null
    let href = ''
    let displayName: string | null = null

    // Postcode → the district page, or failing that the council page.
    async function locateByPostcode(postcode: string) {
      // Outward code first — it is what postcode pages are keyed on, and it
      // works even when postcodes.io cannot resolve a partial postcode.
      const outward = (postcodeDistrict(postcode) ?? postcode.split(/\s+/)[0]).toLowerCase()
      location = postcodes.find((p) => p.slug.toLowerCase() === outward) ?? null
      if (location) href = postcodeHref(location.slug)

      // Fall back to the authority that covers it. Someone searching a postcode
      // in a covered council but an uncovered district should still land
      // somewhere useful rather than being told no.
      if (!location) {
        // PostcodeInfo.slug is the slugified admin district, which is exactly
        // what councils.slug holds — the same slugifyAuthority both sides.
        const geo = await lookupPostcode(postcode)
        if (geo?.slug) {
          location = councils.find((c) => c.slug === geo.slug) ?? null
          if (location) href = councilHref(location.slug)
        }
      }
    }

    function hrefFor(l: SeoLocation): string {
      return l.tier === 'council'
        ? councilHref(l.slug)
        : l.tier === 'postcode'
          ? postcodeHref(l.slug)
          : `/planning-applications/${l.parent_slug}/${l.slug}`
    }

    let chosen: PlaceSuggestion | null = place ?? null

    if (!chosen && UK_POSTCODE.test(query)) {
      await locateByPostcode(query)
    } else {
      // A page whose name is exactly what was typed ("Coventry") needs no
      // outside lookup — unless a specific place was picked from the list, in
      // which case that choice wins.
      if (!chosen) {
        location =
          matchExactName(councils, query) ?? matchExactName(towns, query) ?? matchExactName(postcodes, query)
        if (location) href = hrefFor(location)
      }

      if (!location) {
        if (!chosen) {
          const resolved = await resolvePlace(query)
          if (resolved.ok) {
            chosen = resolved.place
          } else if (resolved.reason === 'ambiguous') {
            return {
              ok: false,
              reason: 'not-found',
              message: `There's more than one of those — pick one from the list, or add the county: ${describeChoices(resolved.suggestions)}.`,
            }
          }
        }

        if (chosen) {
          const postcode = await nearestPostcode(chosen.lat, chosen.lng)
          if (postcode) await locateByPostcode(postcode)
        }
      }

      // Last resort, the original loose match — still catches a partial name
      // of a page we have when the place search is down or finds nothing.
      if (!location && !chosen) {
        location =
          matchByName(councils, query) ?? matchByName(towns, query) ?? matchByName(postcodes, query)
        if (location) href = hrefFor(location)
      }
    }

    if (!location) {
      return {
        ok: false,
        reason: 'no-coverage',
        message: chosen
          ? `We don't have a public page for ${chosen.name} yet. Create a free account to track it — we'll fetch its applications for you.`
          : `We couldn't find that place. Check the spelling, or try a postcode like ST13 5JF.`,
      }
    }

    // TS cannot see that locateByPostcode assigns `location`, so it narrows to
    // null above; restate the type once it is known to be set.
    const found = location as SeoLocation

    // When the page is a postcode district, say which town it is for; when it
    // is a whole council, name the council — its applications are what's shown.
    if (chosen) {
      displayName =
        found.tier === 'postcode' ? `${chosen.name} (${found.slug.toUpperCase()})` : found.name
    }

    // Read the applications behind that page. Scores are not in
    // public_applications by design, so the scored view is read with the admin
    // client server-side — and only scope tags are returned, never the number.
    // The score is what the product sells; the reasoning is what proves it works.
    const admin = createAdminClient()
    const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)

    let q = admin
      .from('planning_applications')
      .select('reference, description, address, application_date, status, score_reasons, council_slug')
      .lte('application_date', cutoff)
      .not('description', 'is', null)
      .in('band', ['HOT', 'WARM'])
      .order('score', { ascending: false })
      .limit(3)

    if (found.tier === 'postcode') q = q.eq('postcode_district', found.slug.toUpperCase())
    else if (found.tier === 'council') q = q.eq('council_slug', found.slug)
    else q = q.eq('council_slug', found.parent_slug ?? '')

    const scope = SEARCH_SCOPES.find((s) => s.id === scopeId)
    if (scope) q = whereReason(q, scope.reason)

    // Counted separately from the preview: the headline number is "how much is
    // here", which a three-row preview cannot tell you.
    let countQ = admin
      .from('planning_applications')
      .select('*', { count: 'exact', head: true })
      .lte('application_date', cutoff)
      .in('band', ['HOT', 'WARM'])
    if (found.tier === 'postcode') countQ = countQ.eq('postcode_district', found.slug.toUpperCase())
    else if (found.tier === 'council') countQ = countQ.eq('council_slug', found.slug)
    else countQ = countQ.eq('council_slug', found.parent_slug ?? '')
    if (scope) countQ = whereReason(countQ, scope.reason)

    const [{ data: rows }, { count: relevant }] = await Promise.all([q, countQ])

    const preview: PreviewOpportunity[] = ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      reference: r.reference as string,
      description: r.description as string,
      address: (r.address as string) ?? null,
      applicationDate: (r.application_date as string) ?? null,
      status: (r.status as string) ?? null,
      scopes: positiveSignals(r.score_reasons as string[]).slice(0, 3),
      councilName: (r.council_slug as string) ?? '',
    }))

    return {
      ok: true,
      placeName: displayName ?? found.name,
      href,
      total: found.app_count,
      relevant: relevant ?? 0,
      preview,
    }
  } catch {
    return {
      ok: false,
      reason: 'error',
      message: 'Something went wrong looking that up. Try again in a moment.',
    }
  }
}

/**
 * Recent scored opportunities nationally, for the homepage feed.
 *
 * Same rules as the search: seven days old or more, civils scope only, scope
 * tags but never the score. Ordered by recency rather than score, because this
 * section is showing that the thing is running, and a stale top-scorer would
 * undercut that however impressive it was.
 */
export async function getRecentOpportunities(limit = 6): Promise<PreviewOpportunity[]> {
  try {
    const admin = createAdminClient()
    const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)

    const { data } = await admin
      .from('planning_applications')
      .select('reference, description, address, application_date, status, score_reasons, council_slug')
      .in('band', ['HOT', 'WARM'])
      .lte('application_date', cutoff)
      .not('description', 'is', null)
      .order('application_date', { ascending: false })
      .limit(limit)

    return ((data ?? []) as Record<string, unknown>[])
      .map((r) => ({
        reference: r.reference as string,
        description: r.description as string,
        address: (r.address as string) ?? null,
        applicationDate: (r.application_date as string) ?? null,
        status: (r.status as string) ?? null,
        scopes: positiveSignals(r.score_reasons as string[]).slice(0, 3),
        councilName: (r.council_slug as string) ?? '',
      }))
      .filter((o) => o.scopes.length > 0)
  } catch {
    return []
  }
}
