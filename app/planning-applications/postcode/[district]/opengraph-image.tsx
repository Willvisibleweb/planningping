// Per-postcode-district social card. The district code is the headline because
// it is what someone searched for — "ST13", not "Staffordshire Moorlands".

import { ImageResponse } from 'next/og'
import { OgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og/card'
import { getLocation } from '@/lib/seo/locations'

export const alt = 'Planning applications by postcode district'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({
  params,
}: {
  params: Promise<{ district: string }>
}) {
  const { district } = await params
  const location = await getLocation('postcode', district)

  const name = location?.name ?? district.toUpperCase()
  const count = location?.app_count ?? 0

  return new ImageResponse(
    (
      <OgCard
        eyebrow="Planning applications"
        title={name}
        subtitle="Every application in this postcode district, scored for civils relevance and tracked as it moves."
        facts={[
          count > 0 ? `${count.toLocaleString()} applications` : 'Monitored daily',
          'Free to search',
        ]}
      />
    ),
    size,
  )
}
