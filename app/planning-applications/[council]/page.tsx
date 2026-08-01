// Council-tier location page: /planning-applications/[council]
//
// Phase 2 scope: routing shell only — static params, unique metadata, 6h ISR,
// and notFound() for any slug not in seo_locations. The rich page content
// (recent applications, generated summary, alert form, internal links, JSON-LD)
// is Phase 3.

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getLocation, getLocationsByTier, SITE_URL } from '@/lib/seo/locations'

export const revalidate = 21600 // 6h — pages refresh as the scraper stores data

type Params = { params: Promise<{ council: string }> }

export async function generateStaticParams(): Promise<{ council: string }[]> {
  const councils = await getLocationsByTier('council')
  return councils.map((c) => ({ council: c.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { council } = await params
  const location = await getLocation('council', council.toLowerCase())
  if (!location) return { title: 'Area not found | PlanningPing' }

  const title = `Planning applications in ${location.name} (${location.app_count}) | PlanningPing`
  const description = `Browse ${location.app_count} recent planning applications in ${location.name}. See addresses, descriptions, references, dates and decisions — updated regularly from the council's public planning register.`
  const url = `${SITE_URL}/planning-applications/${location.slug}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
  }
}

export default async function CouncilPage({ params }: Params) {
  const { council } = await params
  const location = await getLocation('council', council.toLowerCase())
  if (!location) notFound()

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#2563EB]">Council</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#111827] text-balance">
        Planning applications in {location.name}
      </h1>
      <p className="mt-2 text-[#6B7280]">
        {location.app_count} application{location.app_count === 1 ? '' : 's'} currently tracked in{' '}
        {location.name}.
      </p>
      {/* Phase 3: 20 most recent applications, generated summary, alert form,
          internal link block, and ItemList JSON-LD. */}
    </div>
  )
}
