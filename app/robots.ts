import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/locations'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Keep the app + private surfaces out of the index; the public marketing
      // and /planning-applications/* pages stay crawlable.
      disallow: ['/api/', '/auth/', '/dashboard', '/settings', '/leads', '/pipeline'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
