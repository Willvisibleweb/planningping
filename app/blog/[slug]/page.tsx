import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { SITE_URL } from '@/lib/seo/locations'
import { getAllPosts, getPostBySlug } from '@/lib/blog/posts'
import Link from 'next/link'

type Params = { params: Promise<{ slug: string }> }

// Copied from components/legal/PolicyPage.tsx rather than shared — that
// component is scoped to the legal pages; duplicating this ~25-line map once
// is cheaper than risking a shared-import touching privacy/terms for an
// unrelated feature. No Tailwind `prose` plugin is installed in this repo,
// so markdown elements are styled explicitly.
const components: Components = {
  h1: ({ children }) => <h1 className="mb-2 text-3xl font-bold tracking-tighter text-ink">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-3 mt-10 text-lg font-semibold text-ink">{children}</h2>,
  p: ({ children }) => <p className="mb-4 text-base leading-relaxed text-ink-muted">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-4 list-disc space-y-1.5 pl-5 text-base leading-relaxed text-ink-muted">{children}</ul>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  // break-words so a bare planning-portal URL in post copy can't push the
  // article wider than a 375px viewport.
  a: ({ href, children }) => (
    <a href={href} className="pp-link break-words">{children}</a>
  ),
  hr: () => <hr className="my-8 border-border" />,
  em: ({ children }) => <em className="not-italic text-neutral-500">{children}</em>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  // Long references and inline code get their own scroll rather than widening
  // the page.
  code: ({ children }) => (
    <code className="tabular-data rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[0.9em] text-ink ring-1 ring-inset ring-neutral-200">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mb-4 overflow-x-auto rounded-md border border-border bg-surface-sunken p-4 text-xs leading-relaxed">
      {children}
    </pre>
  ),
}

function niceDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return getAllPosts().map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return { title: 'Post not found | PlanningPing' }

  const title = `${post.title} | PlanningPing`
  const url = `${SITE_URL}/blog/${post.slug}`

  return {
    title,
    description: post.excerpt,
    alternates: { canonical: url },
    openGraph: { title, description: post.excerpt, url, type: 'article' },
  }
}

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/blog" className="text-sm font-medium text-primary-500 hover:underline">
        &larr; Back to blog
      </Link>

      <p className="mt-6 text-xs text-neutral-500">{niceDate(post.date)}</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">{post.title}</h1>

      <div className="mt-8">
        <ReactMarkdown components={components}>{post.content}</ReactMarkdown>
      </div>
    </div>
  )
}
