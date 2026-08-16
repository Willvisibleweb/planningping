// Default social card for the whole site. Any route without its own
// opengraph-image inherits this one, so a shared link is never a bare grey box.

import { ImageResponse } from 'next/og'
import { OgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og/card'

export const alt = 'PlanningPing — UK planning applications, scored and tracked'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image() {
  return new ImageResponse(
    (
      <OgCard
        eyebrow="UK planning intelligence"
        title="Spot planning applications first"
        subtitle="Track any UK postcode, score what matters, and pursue it — from application to won job."
        facts={['400+ planning authorities', 'Updated every morning']}
      />
    ),
    size,
  )
}
