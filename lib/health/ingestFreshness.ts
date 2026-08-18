// Is the ingest actually running?
//
// It has now stopped twice without anyone noticing: eight days in early August
// when the function hit its time limit mid-loop and Vercel killed it before the
// write, and four more days this week because the Vercel cron never fired at
// all. Both times it was discovered by a human looking at the product and
// thinking "this looks empty", which is not a monitoring strategy.
//
// The obvious fix — check for staleness at the end of the ingest and send an
// email — cannot work, because the failure mode is the ingest not running. A
// check that lives inside the thing being checked reports nothing precisely
// when there is something to report. So this is a plain function with no
// scheduler of its own, called from two places that do run: the dashboard,
// which a signed-in user loads, and a health endpoint an external monitor can
// poll without depending on Vercel's scheduler at all.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// A daily job that has not run in two days is broken, not late. Two missed runs
// rather than one, so a single slow morning or a retry does not cry wolf.
export const STALE_AFTER_HOURS = 48

export interface IngestFreshness {
  /** True only when something is genuinely wrong — see the note on new areas. */
  stale: boolean
  /** Hours since the most recent successful fetch, null if there has never been one. */
  hoursSinceFetch: number | null
  /** Active areas whose last successful fetch is older than the threshold. */
  staleAreas: number
  /**
   * Areas added too recently to have been fetched yet.
   *
   * Counted apart from staleAreas because they are not a fault. Treating a
   * never-fetched area as broken meant adding a territory immediately produced
   * "our check for new applications has never run" — alarming, and untrue: the
   * check was running fine every morning, that area simply had not had its turn.
   * The alarm now fires only when an area has had a full threshold window to be
   * picked up and still has not been.
   */
  awaitingFirstFetch: number
  totalAreas: number
}

/**
 * Freshness for the signed-in user's own territories — the dashboard banner.
 *
 * Scoped by RLS, which is right here: a user should be told their data is stale
 * based on their areas, not somebody else's.
 */
export async function getIngestFreshness(): Promise<IngestFreshness> {
  return measure(await createClient())
}

/**
 * Freshness across every active territory, regardless of owner — the health
 * endpoint.
 *
 * Must use the service role. The endpoint is unauthenticated by design, so a
 * request-scoped client sees no rows at all through RLS and the check reports a
 * cheerful `ok` with totalAreas 0 for ever. That is worse than no monitoring:
 * it is a green light wired to nothing, and it is exactly the failure this
 * whole file exists to catch. Caught by reading the endpoint's own output
 * rather than by trusting it.
 */
export async function getGlobalIngestFreshness(): Promise<IngestFreshness> {
  return measure(createAdminClient())
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function measure(supabase: any): Promise<IngestFreshness> {

  // last_planit_fetch_at is stamped only on a successful fetch (see the ingest),
  // so this measures work actually done rather than attempts made. That
  // distinction is the whole point: the August failure ran every morning and
  // completed, it just never wrote anything.
  const { data } = await supabase
    .from('tracked_areas')
    .select('last_planit_fetch_at, created_at')
    .eq('is_active', true)

  const areas = (data ?? []) as { last_planit_fetch_at: string | null; created_at: string }[]
  if (areas.length === 0) {
    return {
      stale: false,
      hoursSinceFetch: null,
      staleAreas: 0,
      awaitingFirstFetch: 0,
      totalAreas: 0,
    }
  }

  const cutoff = Date.now() - STALE_AFTER_HOURS * 3_600_000
  let newest = 0
  let staleAreas = 0
  let awaitingFirstFetch = 0

  for (const a of areas) {
    const fetched = a.last_planit_fetch_at ? new Date(a.last_planit_fetch_at).getTime() : null
    if (fetched !== null && fetched > newest) newest = fetched

    if (fetched === null) {
      // Never fetched. Whether that is a fault depends entirely on age: added
      // ten minutes ago it is simply waiting for the next run, added a week ago
      // and never touched, something is wrong.
      const created = new Date(a.created_at).getTime()
      if (created < cutoff) staleAreas++
      else awaitingFirstFetch++
      continue
    }

    if (fetched < cutoff) staleAreas++
  }

  return {
    stale: staleAreas > 0,
    hoursSinceFetch: newest > 0 ? Math.floor((Date.now() - newest) / 3_600_000) : null,
    staleAreas,
    awaitingFirstFetch,
    totalAreas: areas.length,
  }
}
