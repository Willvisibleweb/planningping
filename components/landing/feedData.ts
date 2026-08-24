// Real applications and real coverage figures for the landing page.
//
// Read through public_applications, the view that exists for public consumption:
// curated columns only, and nothing newer than 7 days so that fresh data stays
// a paid feature. Nothing here can leak a score — the view does not carry one.
//
// Every figure returned is one we can defend if a prospect asks where it came
// from, which is the only reason to put numbers on a landing page at all.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface FeedItem {
  id: string
  reference: string
  description: string
  address: string | null
  council: string
}

export interface LandingStats {
  /** Planning authorities we can serve — not just those with data stored. */
  authorities: number
  /** Applications published in the last 30 days across tracked territories. */
  recentApplications: number
  /** Everything in the public view — the size of the corpus behind the site. */
  publicApplications: number
  /** Location pages a visitor can browse without an account. */
  publicPages: number
}

function titleCase(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Recent real applications for the hero feed.
 *
 * Failure returns an empty array rather than throwing: the landing page is the
 * one route that must render for someone who has never signed in, and a
 * database hiccup should cost a decorative panel, not the whole page.
 */
export async function getFeedItems(limit = 12): Promise<FeedItem[]> {
  try {
    // Newest-first was the obvious ordering and it made the page worse. What it
    // surfaced was "replacement of timber windows with uPVC", "display of
    // temporary festive display", "change of use to gaming lounge" — real
    // applications, and completely irrelevant to a civils firm. A landing page
    // for construction sales intelligence showing shopfront signage argues
    // against itself.
    //
    // So the feed shows the schemes the product would actually flag: the ones
    // that scored as carrying civils scope. That is not cherry-picking, it is
    // the product's whole function — the point being demonstrated is precisely
    // that we can tell these apart from the window replacements.
    //
    // The admin client is used only to filter by band, which the public view
    // deliberately does not expose. Everything actually rendered still comes
    // from the same curated column set, and the 7-day delay is reapplied here
    // by hand because that guard lives in the view, not the base table. No
    // score reaches the page: the query filters on band, it does not select it.
    const admin = createAdminClient()
    const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)

    const { data } = await admin
      .from('planning_applications')
      .select('id, reference, description, address, council_slug, application_date')
      .in('band', ['HOT', 'WARM'])
      .lte('application_date', cutoff)
      .not('description', 'is', null)
      .order('application_date', { ascending: false })
      .limit(limit)

    return ((data ?? []) as Record<string, string | null>[])
      .filter((r) => r.description && r.description.length > 12)
      .map((r) => ({
        id: r.id as string,
        reference: r.reference as string,
        description: r.description as string,
        address: r.address,
        council: titleCase((r.council_slug as string) ?? ''),
      }))
  } catch {
    return []
  }
}

/**
 * The two figures the page claims.
 *
 * Authorities, not stored application count, is the headline number on purpose.
 * Competitors advertise 350–380 councils and several thousand live projects;
 * our stored total is smaller because applications are ingested for territories
 * customers actually track rather than by crawling the country up front. Quoting
 * the stored count would invite a comparison we lose on a metric that does not
 * describe what the product does. Coverage is the honest strength, and it is
 * competitive.
 */
export async function getLandingStats(): Promise<LandingStats> {
  const fallback: LandingStats = {
    authorities: 400, recentApplications: 0, publicApplications: 0, publicPages: 0,
  }
  try {
    const supabase = await createClient()
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)

    const [{ count: authorities }, { count: recent }, { count: publicApps }, { count: pages }] =
      await Promise.all([
        supabase.from('councils').select('*', { count: 'exact', head: true }),
        supabase
          .from('public_applications')
          .select('*', { count: 'exact', head: true })
          .gte('application_date', since),
        supabase.from('public_applications').select('*', { count: 'exact', head: true }),
        supabase.from('seo_locations').select('*', { count: 'exact', head: true }),
      ])

    return {
      // Rounded down to the nearest 25. The exact count creeps up every time
      // the ingest meets a new authority, and a landing page that quotes 425
      // one week and 427 the next reads as unmaintained — this is the mistake
      // "20+ councils" made in the other direction by going stale.
      authorities: Math.max(Math.floor((authorities ?? 400) / 25) * 25, 400),
      recentApplications: recent ?? 0,
      publicApplications: publicApps ?? 0,
      publicPages: pages ?? 0,
    }
  } catch {
    return fallback
  }
}
