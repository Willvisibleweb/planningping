// Data helpers for the programmatic-SEO location pages.
//
// These pages are public, statically generated, and revalidated on a schedule —
// so they run at BUILD time and during ISR, where there is no request scope and
// therefore no cookies. The cookie-based server client (lib/supabase/server.ts)
// can't run there, so we reuse the existing admin client (lib/supabase/admin.ts).
//
// SAFETY: every read here targets the scoped views from migration 0008
// (seo_locations / public_applications), never the base planning_applications
// table. Those views expose public-record columns only, so the admin client's
// RLS bypass cannot reach score / band / score_reasons / raw_data.

import { createAdminClient } from '@/lib/supabase/admin'

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://planningping.vercel.app'
).replace(/\/$/, '')

export type LocationTier = 'council' | 'postcode' | 'town'

export interface SeoLocation {
  tier: LocationTier
  slug: string
  parent_slug: string | null
  name: string
  app_count: number
}

const LOCATION_COLUMNS = 'tier, slug, parent_slug, name, app_count'

// Every location of a tier that clears the >=5 threshold (the view enforces it).
export async function getLocationsByTier(tier: LocationTier): Promise<SeoLocation[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('seo_locations')
    .select(LOCATION_COLUMNS)
    .eq('tier', tier)
    .order('app_count', { ascending: false })

  if (error) throw new Error(`seo_locations query failed for tier "${tier}": ${error.message}`)
  return (data ?? []) as SeoLocation[]
}

// A single location, or null if it isn't in the view (below threshold / unknown
// slug) — callers use that null to notFound(). `parentSlug` scopes town lookups
// to their council.
export async function getLocation(
  tier: LocationTier,
  slug: string,
  parentSlug?: string,
): Promise<SeoLocation | null> {
  const supabase = createAdminClient()
  let query = supabase
    .from('seo_locations')
    .select(LOCATION_COLUMNS)
    .eq('tier', tier)
    .eq('slug', slug)

  if (parentSlug !== undefined) query = query.eq('parent_slug', parentSlug)

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`seo_locations lookup failed (${tier}/${slug}): ${error.message}`)
  return (data as SeoLocation | null) ?? null
}
