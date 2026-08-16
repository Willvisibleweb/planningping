// Per-council social card. A link to Westminster's page should say Westminster,
// not "PlanningPing" — the place name is the whole reason someone clicks.

import { ImageResponse } from 'next/og'
import { OgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og/card'
import { getLocation } from '@/lib/seo/locations'

export const alt = 'Planning applications by council'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ council: string }> }) {
  const { council } = await params
  const location = await getLocation('council', council)

  // Falls back to a readable slug rather than failing the build. A missing
  // location shouldn't take the whole page down over its preview image.
  const name = location?.name ?? council.replace(/-/g, ' ')
  const count = location?.app_count ?? 0

  return new ImageResponse(
    (
      <OgCard
        eyebrow="Planning applications"
        title={name}
        subtitle="Every application in this authority, scored for civils relevance and tracked as it moves."
        facts={[
          count > 0 ? `${count.toLocaleString()} applications` : 'Monitored daily',
          'Free to search',
        ]}
      />
    ),
    size,
  )
}
