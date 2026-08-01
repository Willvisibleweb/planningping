// Town-tier location page: /planning-applications/[council]/[town]
//
// Towns come from the curated seo_towns gazetteer (only councils with
// comma-delimited addresses, e.g. Staffordshire Moorlands). Phase 2 scope:
// routing shell only — content is Phase 3.

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getLocation, getLocationsByTier, SITE_URL } from '@/lib/seo/locations'

export const revalidate = 21600

type Params = { params: Promise<{ council: string; town: string }> }

export async function generateStaticParams(): Promise<{ council: string; town: string }[]> {
  const towns = await getLocationsByTier('town')
  return towns
    .filter((t): t is typeof t & { parent_slug: string } => t.parent_slug !== null)
    .map((t) => ({ council: t.parent_slug, town: t.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { council, town } = await params
  const location = await getLocation('town', town.toLowerCase(), council.toLowerCase())
  if (!location) return { title: 'Area not found | PlanningPing' }

  // Parent council display name enriches the title/description uniquely.
  const parent = await getLocation('council', council.toLowerCase())
  const inCouncil = parent ? `, ${parent.name}` : ''

  const title = `Planning applications in ${location.name}${inCouncil} (${location.app_count}) | PlanningPing`
  const description = `Browse ${location.app_count} recent planning applications in ${location.name}${inCouncil}. Addresses, descriptions, references, dates and decisions from the council's public planning register.`
  const url = `${SITE_URL}/planning-applications/${council.toLowerCase()}/${location.slug}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
  }
}

export default async function TownPage({ params }: Params) {
  const { council, town } = await params
  const location = await getLocation('town', town.toLowerCase(), council.toLowerCase())
  if (!location) notFound()

  const parent = await getLocation('council', council.toLowerCase())

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#2563EB]">
        Town{parent ? ` · ${parent.name}` : ''}
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#111827] text-balance">
        Planning applications in {location.name}
      </h1>
      <p className="mt-2 text-[#6B7280]">
        {location.app_count} application{location.app_count === 1 ? '' : 's'} currently tracked in{' '}
        {location.name}.
      </p>
      {/* Phase 3: recent applications, generated summary, alert form, internal links, JSON-LD. */}
    </div>
  )
}
