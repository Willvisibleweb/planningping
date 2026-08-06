// Shared renderer for the public legal pages (/terms, /privacy).
// Renders an approved markdown string with styling that matches the rest of the
// site (same colour tokens and Inter font as the landing page). No Tailwind
// `prose` plugin is installed, so element styles are applied explicitly via the
// react-markdown `components` map.

import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import Link from 'next/link'

// Map markdown elements to the site's existing colour tokens / spacing.
const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-3xl font-bold tracking-tight text-ink mb-2">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold text-ink mt-10 mb-3">{children}</h2>
  ),
  p: ({ children }) => (
    <p className="text-sm leading-relaxed text-ink mb-4">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-5 mb-4 space-y-1.5 text-sm leading-relaxed text-ink">
      {children}
    </ul>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} className="text-primary-500 hover:underline">
      {children}
    </a>
  ),
  hr: () => <hr className="my-8 border-border" />,
  em: ({ children }) => <em className="not-italic text-neutral-500">{children}</em>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
}

export default function PolicyPage({ markdown }: { markdown: string }) {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Nav — mirrors the landing page header */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold tracking-tight text-ink">
            PlanningPing
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-ink-muted hover:text-ink transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <ReactMarkdown components={components}>{markdown}</ReactMarkdown>
        </div>
      </main>
    </div>
  )
}
