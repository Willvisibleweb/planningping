// Per-article social card. Blog posts are the most-shared pages by nature, so
// the headline is the post title rather than the product name.

import { ImageResponse } from 'next/og'
import { OgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og/card'
import { getPostBySlug } from '@/lib/blog/posts'

export const alt = 'PlanningPing article'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

function niceDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (isNaN(d.getTime())) return ''
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPostBySlug(slug)

  if (!post) {
    return new ImageResponse(
      <OgCard eyebrow="PlanningPing" title="Article" />,
      size,
    )
  }

  return new ImageResponse(
    (
      <OgCard
        eyebrow="Article"
        title={post.title}
        subtitle={post.excerpt}
        facts={[niceDate(post.date)].filter(Boolean)}
      />
    ),
    size,
  )
}
