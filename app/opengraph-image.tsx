// Default social card for the whole site. Any route without its own
// opengraph-image inherits this one, so a shared link is never a bare grey box.

import { ImageResponse } from 'next/og'
import { OgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og/card'

export const alt = 'PlanningPing - UK construction sales intelligence from planning data'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image() {
  return new ImageResponse(
    (
      <OgCard
        eyebrow="UK construction sales intelligence"
        title="Find projects worth pursuing"
        subtitle="Planning applications monitored, analysed and prioritised for construction sales teams."
        facts={['UK planning applications', 'AI qualification']}
      />
    ),
    size,
  )
}
