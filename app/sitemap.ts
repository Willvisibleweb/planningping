import type { MetadataRoute } from 'next'
import { getLocationsByTier, SITE_URL } from '@/lib/seo/locations'

// Regenerate on the same 6h cadence as the pages, so new locations enter the
// sitemap as scraper coverage grows.
export const revalidate = 21600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [councils, postcodes, towns] = await Promise.all([
    getLocationsByTier('council'),
    getLocationsByTier('postcode'),
    getLocationsByTier('town'),
  ])

  const now = new Date()
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
  ]

  for (const c of councils) {
    entries.push({
      url: `${SITE_URL}/planning-applications/${c.slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    })
  }
  for (const p of postcodes) {
    entries.push({
      url: `${SITE_URL}/planning-applications/postcode/${p.slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.6,
    })
  }
  for (const t of towns) {
    if (!t.parent_slug) continue
    entries.push({
      url: `${SITE_URL}/planning-applications/${t.parent_slug}/${t.slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.6,
    })
  }

  // Google allows 50,000 URLs per sitemap; we're far below that. If this ever
  // approaches the limit, split with generateSitemaps() (Next serves the shards
  // at /sitemap/[id].xml) — deliberately not done now to avoid needless
  // complexity at current scale.
  return entries
}
