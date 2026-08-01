// Postcode-district-tier page: /planning-applications/postcode/[district]
//
// "postcode" is a static segment sitting beside the dynamic [council] segment;
// Next.js matches the static path first, so there is no route collision. Phase 2
// scope: routing shell only — content is Phase 3.

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getLocation, getLocationsByTier, SITE_URL } from '@/lib/seo/locations'
import LocationPageView from '@/components/seo/LocationPageView'

export const revalidate = 21600

type Params = { params: Promise<{ district: string }> }

export async function generateStaticParams(): Promise<{ district: string }[]> {
  const districts = await getLocationsByTier('postcode')
  return districts.map((d) => ({ district: d.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { district } = await params
  const location = await getLocation('postcode', district.toLowerCase())
  if (!location) return { title: 'Area not found | PlanningPing' }

  const title = `Planning applications in ${location.name} (${location.app_count}) | PlanningPing`
  const description = `Browse ${location.app_count} recent planning applications in the ${location.name} postcode area. Addresses, descriptions, references, dates and decisions from public council registers.`
  const url = `${SITE_URL}/planning-applications/postcode/${location.slug}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
  }
}

export default async function PostcodePage({ params }: Params) {
  const { district } = await params
  const location = await getLocation('postcode', district.toLowerCase())
  if (!location) notFound()

  return (
    <LocationPageView
      location={location}
      canonicalUrl={`${SITE_URL}/planning-applications/postcode/${location.slug}`}
    />
  )
}
