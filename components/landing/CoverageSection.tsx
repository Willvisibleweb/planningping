'use client'

// The coverage map section, and the reason the map is not loaded with the page.
//
// Leaflet plus OpenStreetMap tiles is real weight and a burst of external
// requests. This section sits well below the fold, so none of it is fetched
// until someone scrolls near it — the homepage's first paint costs nothing for
// a map most visitors will never reach.
//
// The table underneath is not a fallback, it is the accessible view of the same
// numbers. A map communicates spread; only the table can be read by a screen
// reader, searched, or trusted for an exact figure.

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { CoveragePoint } from '@/lib/analytics/coverageMap'

// ssr:false because Leaflet touches window on import.
const CoverageMap = dynamic(() => import('./CoverageMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[380px] animate-pulse rounded-md border border-border bg-surface-sunken sm:h-[460px]" />
  ),
})

export default function CoverageSection({
  points,
  authorities,
}: {
  points: CoveragePoint[]
  authorities: number
}) {
  const [inView, setInView] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      const id = requestAnimationFrame(() => setInView(true))
      return () => cancelAnimationFrame(id)
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        setInView(true)
        io.disconnect()
      },
      // Starts loading a screen early so it has arrived by the time it is read.
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const total = points.reduce((n, p) => n + p.count, 0)

  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:gap-8">
      <div>
        {inView ? (
          <CoverageMap points={points} />
        ) : (
          <div className="h-[380px] rounded-md border border-border bg-surface-sunken sm:h-[460px]" />
        )}
        <p className="mt-2 text-2xs leading-relaxed text-neutral-500">
          Circle area is proportional to how many applications we hold for that
          authority. We can cover any of {authorities}+ UK planning authorities on
          request &mdash; this shows the {points.length} where data is loaded today.
        </p>
      </div>

      {/* The same figures, readable. Ranked because "who has most" is the
          question a map makes you squint to answer. */}
      <div className="min-w-0">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Applications held per planning authority, highest first
          </caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="pb-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                Authority
              </th>
              <th scope="col" className="pb-2 text-right text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                Applications
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {points.slice(0, 10).map((p) => (
              <tr key={p.slug}>
                <td className="py-1.5">
                  <Link
                    href={`/planning-applications/${p.slug}`}
                    className="text-ink transition-colors duration-fast ease-standard hover:text-primary-600"
                  >
                    {p.name}
                  </Link>
                </td>
                <td className="tabular-data py-1.5 text-right text-ink-muted">
                  {p.count.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border-strong">
              <td className="pt-2 text-xs font-medium text-ink">
                {points.length} authorities loaded
              </td>
              <td className="tabular-data pt-2 text-right text-xs font-semibold text-ink">
                {total.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
