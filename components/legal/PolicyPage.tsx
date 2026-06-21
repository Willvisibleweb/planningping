// Shared renderer for the public legal pages (/terms, /privacy).
// Renders an approved markdown string with styling that matches the rest of the
// site (same colour tokens and Inter font as the landing page). No Tailwind
// `prose` plugin is installed, so element styles are applied explicitly via the
// react-markdown `components` map.

import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'

// Map markdown elements to the site's existing colour tokens / spacing.
const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-3xl font-bold tracking-tight text-[#111827] mb-2">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold text-[#111827] mt-10 mb-3">{children}</h2>
  ),
  p: ({ children }) => (
    <p className="text-sm leading-relaxed text-[#374151] mb-4">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-5 mb-4 space-y-1.5 text-sm leading-relaxed text-[#374151]">
      {children}
    </ul>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} className="text-[#2563EB] hover:underline">
      {children}
    </a>
  ),
  hr: () => <hr className="my-8 border-[#E5E7EB]" />,
  em: ({ children }) => <em className="not-italic text-[#9CA3AF]">{children}</em>,
  strong: ({ children }) => <strong className="font-semibold text-[#111827]">{children}</strong>,
}

export default function PolicyPage({ markdown }: { markdown: string }) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Nav — mirrors the landing page header */}
      <header className="border-b border-[#E5E7EB]">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="text-sm font-semibold tracking-tight text-[#111827]">
            PlanningPing
          </a>
          <a
            href="/login"
            className="text-sm font-medium text-[#6B7280] hover:text-[#111827] transition-colors"
          >
            Sign in
          </a>
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
