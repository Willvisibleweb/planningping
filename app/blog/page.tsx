import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/seo/locations'
import { getAllPosts } from '@/lib/blog/posts'

const TITLE = 'Blog | PlanningPing'
const DESCRIPTION =
  'Notes on UK planning applications, civils lead generation, and getting ahead of opportunities before your competitors see them.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/blog`, type: 'website' },
}

function niceDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export default function BlogIndexPage() {
  const posts = getAllPosts()

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#2563EB]">Blog</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#111827]">
        Notes on planning applications &amp; civils leads
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#4B5563]">{DESCRIPTION}</p>

      <div className="mt-10 space-y-8">
        {posts.map((post) => (
          <a key={post.slug} href={`/blog/${post.slug}`} className="block group">
            <p className="text-xs text-[#9CA3AF]">{niceDate(post.date)}</p>
            <h2 className="mt-1 text-lg font-semibold text-[#111827] group-hover:text-[#2563EB] transition-colors">
              {post.title}
            </h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-[#4B5563]">{post.excerpt}</p>
            <span className="mt-2 inline-block text-sm font-medium text-[#2563EB]">Read more &rarr;</span>
          </a>
        ))}
      </div>
    </div>
  )
}
