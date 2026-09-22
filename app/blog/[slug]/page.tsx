import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { SITE_URL } from '@/lib/seo/locations'
import { getAllPosts, getPostBySlug } from '@/lib/blog/posts'
import type { BlogTable } from '@/lib/blog/types'
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
  table: ({ children }) => (
    <div className="mb-6 overflow-x-auto rounded-md border border-border bg-surface">
      <table className="w-full min-w-[44rem] text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-sunken text-left">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="border-b border-border px-3 py-2 text-left text-xs font-semibold text-ink">{children}</th>
  ),
  td: ({ children }) => (
    <td className="align-top px-3 py-2 text-xs leading-relaxed text-ink-muted">{children}</td>
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

function DataTable({ table }: { table: BlogTable }) {
  return (
    <div className="mb-6 overflow-x-auto rounded-md border border-border bg-surface">
      <table className="w-full min-w-[44rem] text-sm">
        <caption className="sr-only">{table.caption}</caption>
        <thead className="bg-surface-sunken text-left">
          <tr>
            {table.columns.map((column) => (
              <th key={column} scope="col" className="border-b border-border px-3 py-2 text-left text-xs font-semibold text-ink">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {table.rows.map((row) => (
            <tr key={row.join('|')}>
              {row.map((cell, index) => {
                const className = 'align-top px-3 py-2 text-xs leading-relaxed text-ink-muted'
                return index === 0 ? (
                  <th key={cell} scope="row" className={`${className} font-semibold text-ink`}>
                    {cell}
                  </th>
                ) : (
                  <td key={cell} className={className}>{cell}</td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MarkdownWithTables({
  content,
  tables,
}: {
  content: string
  tables: Record<string, BlogTable> | undefined
}) {
  const parts = content.split(/(\[\[table:[a-z0-9-]+\]\])/g)
  return (
    <>
      {parts.map((part, index) => {
        const match = part.match(/^\[\[table:([a-z0-9-]+)\]\]$/)
        if (match) {
          const table = tables?.[match[1]]
          return table ? <DataTable key={`${match[1]}-${index}`} table={table} /> : null
        }
        return part.trim() ? (
          <ReactMarkdown key={index} components={components}>{part}</ReactMarkdown>
        ) : null
      })}
    </>
  )
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return getAllPosts().map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return { title: 'Post not found | PlanningPing' }

  const title = post.metaTitle ?? `${post.title} | PlanningPing`
  const description = post.metaDescription ?? post.excerpt
  const url = `${SITE_URL}/blog/${post.slug}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'article' },
  }
}

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()
  const canonicalUrl = `${SITE_URL}/blog/${post.slug}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
          { '@type': 'ListItem', position: 3, name: post.title, item: canonicalUrl },
        ],
      },
      {
        '@type': 'Article',
        headline: post.title,
        description: post.metaDescription ?? post.excerpt,
        datePublished: post.date,
        dateModified: post.updated ?? post.date,
        mainEntityOfPage: canonicalUrl,
        author: {
          '@type': 'Organization',
          name: 'PlanningPing',
          url: SITE_URL,
        },
        publisher: {
          '@type': 'Organization',
          name: 'PlanningPing',
          url: SITE_URL,
        },
      },
    ],
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <Link href="/blog" className="text-sm font-medium text-primary-500 hover:underline">
        &larr; Back to blog
      </Link>

      <p className="mt-6 text-xs text-neutral-500">{niceDate(post.date)}</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">{post.title}</h1>

      <div className="mt-8">
        <MarkdownWithTables content={post.content} tables={post.tables} />
      </div>
    </div>
  )
}
