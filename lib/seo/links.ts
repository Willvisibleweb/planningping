// Internal-link helpers — the crawl graph between location pages.
//   council -> its towns + its postcode districts + other councils
//   town    -> sibling towns + parent council
//   postcode-> other postcode districts + councils that cover it

import { createAdminClient } from '@/lib/supabase/admin'
import { getLocationsByTier, type SeoLocation } from '@/lib/seo/locations'

export interface LinkItem {
  href: string
  label: string
}

export async function getTownsForCouncil(councilSlug: string): Promise<SeoLocation[]> {
  const towns = await getLocationsByTier('town')
  return towns.filter((t) => t.parent_slug === councilSlug)
}

// Postcode districts that have a page AND appear in this council's applications.
export async function getPostcodesForCouncil(councilSlug: string): Promise<SeoLocation[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('public_applications')
    .select('postcode_district')
    .eq('council_slug', councilSlug)
    .not('postcode_district', 'is', null)
  if (error) throw new Error(`postcode-for-council query failed (${councilSlug}): ${error.message}`)

  const inCouncil = new Set(
    ((data ?? []) as { postcode_district: string }[]).map((r) => r.postcode_district.toLowerCase()),
  )
  const pages = await getLocationsByTier('postcode')
  return pages.filter((p) => inCouncil.has(p.slug))
}

// Councils that cover a given postcode district (for postcode-page up-links).
export async function getCouncilsForPostcode(districtSlug: string): Promise<SeoLocation[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('public_applications')
    .select('council_slug')
    .eq('postcode_district', districtSlug.toUpperCase())
  if (error) throw new Error(`council-for-postcode query failed (${districtSlug}): ${error.message}`)

  const slugs = new Set(((data ?? []) as { council_slug: string }[]).map((r) => r.council_slug))
  const councils = await getLocationsByTier('council')
  return councils.filter((c) => slugs.has(c.slug))
}

// --- href builders ---
export const councilHref = (slug: string) => `/planning-applications/${slug}`
export const townHref = (councilSlug: string, slug: string) => `/planning-applications/${councilSlug}/${slug}`
export const postcodeHref = (slug: string) => `/planning-applications/postcode/${slug}`
