// Per-town social card. Names the town and its authority — a link to Leek
// should say Leek, with Staffordshire Moorlands as context.

import { ImageResponse } from 'next/og'
import { OgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og/card'
import { getLocation } from '@/lib/seo/locations'

export const alt = 'Planning applications by town'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

function titleCase(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default async function Image({
  params,
}: {
  params: Promise<{ council: string; town: string }>
}) {
  const { council, town } = await params
  const [location, parent] = await Promise.all([
    getLocation('town', town),
    getLocation('council', council),
  ])

  const name = location?.name ?? titleCase(town)
  const councilName = parent?.name ?? titleCase(council)
  const count = location?.app_count ?? 0

  return new ImageResponse(
    (
      <OgCard
        eyebrow="Planning applications"
        title={name}
        subtitle={`Applications in ${councilName}, scored for civils relevance and tracked as they move.`}
        facts={[
          count > 0 ? `${count.toLocaleString()} applications` : 'Monitored daily',
          councilName,
        ]}
      />
    ),
    size,
  )
}
