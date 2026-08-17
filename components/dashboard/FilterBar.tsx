'use client'

// The filter panel for the opportunity feed.
//
// Every control is a link, not a form. The URL is the state, so a filtered view
// can be bookmarked and sent to a colleague, back works, and the page stays a
// server component that filters in the database instead of shipping every row
// to the browser to be hidden with CSS.
//
// Collapsed to a summary by default. Seven filter groups open on arrival pushes
// the results themselves below the fold, which defeats the point of filtering —
// the count of what is active is the thing worth showing permanently.

import { useState } from 'react'
import Link from 'next/link'
import { SlidersHorizontal, X, Check } from 'lucide-react'
import {
  SCOPES,
  DECISION_STATES,
  DATE_RANGES,
  APP_TYPES,
  activeFilterCount,
  buildFilterHref,
  type OpportunityFilters,
} from '@/lib/filters/opportunityFilters'
import { BAND_LABEL, BAND_ORDER } from './FitScore'
import Badge from '@/components/ui/Badge'

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="border-t border-border py-3 first:border-t-0 first:pt-0">
      <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

// A filter option. Selecting the active one clears it, so every chip is its own
// undo and there is no separate "clear this group" control to hunt for.
function Chip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-[background-color,border-color,color,box-shadow] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2 ${
        active
          ? 'border-primary-500 bg-primary-500 text-white shadow-sm'
          : 'border-border bg-surface text-ink-muted hover:border-primary-300 hover:bg-primary-50 hover:text-ink'
      }`}
    >
      {children}
      {active && <X size={11} aria-hidden="true" />}
    </Link>
  )
}

export default function FilterBar({
  filters,
  councils,
  resultCount,
  contactsAvailable,
}: {
  filters: OpportunityFilters
  /** The user's own tracked councils — never the full national list. */
  councils: { slug: string; name: string }[]
  resultCount: number
  /**
   * How many opportunities in scope actually carry an agent. The control is
   * hidden at zero rather than shown returning nothing: every council holding
   * agent data today is one no active territory covers, so for most accounts
   * this filter would be a chip that does nothing, which reads as broken.
   */
  contactsAvailable: number
}) {
  const active = activeFilterCount(filters)
  const [open, setOpen] = useState(active > 0)

  return (
    <div className="rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-ink transition-colors duration-fast ease-standard hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
        >
          <SlidersHorizontal size={15} aria-hidden="true" />
          Filters
          {active > 0 && (
            <Badge tone="primary" className="tabular-data">{active}</Badge>
          )}
        </button>

        <div className="flex items-center gap-3">
          <span aria-live="polite" className="tabular-data text-xs text-ink-muted">
            {resultCount} {resultCount === 1 ? 'opportunity' : 'opportunities'}
          </span>
          {active > 0 && (
            <Link
              href="/leads"
              scroll={false}
              className="rounded-sm text-xs font-medium text-ink-muted transition-colors duration-fast ease-standard hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
            >
              Clear all
            </Link>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-border px-4 py-3">
          <Row label="Fit">
            {BAND_ORDER.map((b) => (
              <Chip
                key={b}
                active={filters.band === b}
                href={buildFilterHref(filters, 'band', filters.band === b ? null : b)}
              >
                {BAND_LABEL[b]}
              </Chip>
            ))}
          </Row>

          <Row label="Scope">
            {SCOPES.map((s) => (
              <Chip
                key={s.id}
                active={filters.scope === s.id}
                href={buildFilterHref(filters, 'scope', filters.scope === s.id ? null : s.id)}
              >
                {s.label}
              </Chip>
            ))}
          </Row>

          <Row label="Submitted">
            {DATE_RANGES.map((r) => (
              <Chip
                key={r.id}
                active={filters.days === r.days}
                href={buildFilterHref(filters, 'days', filters.days === r.days ? null : r.id)}
              >
                {r.label}
              </Chip>
            ))}
          </Row>

          <Row label="Decision">
            {DECISION_STATES.map((d) => (
              <Chip
                key={d.id}
                active={filters.decision === d.id}
                href={buildFilterHref(filters, 'decision', filters.decision === d.id ? null : d.id)}
              >
                {d.label}
              </Chip>
            ))}
          </Row>

          <Row label="Application type">
            {APP_TYPES.map((t) => (
              <Chip
                key={t}
                active={filters.appType === t}
                href={buildFilterHref(filters, 'appType', filters.appType === t ? null : t)}
              >
                {t}
              </Chip>
            ))}
          </Row>

          {councils.length > 1 && (
            <Row label="Authority">
              {councils.map((c) => (
                <Chip
                  key={c.slug}
                  active={filters.council === c.slug}
                  href={buildFilterHref(filters, 'council', filters.council === c.slug ? null : c.slug)}
                >
                  {c.name}
                </Chip>
              ))}
            </Row>
          )}

          {contactsAvailable > 0 && (
            <Row label="Contact">
              <Chip
                active={filters.withContact}
                href={buildFilterHref(filters, 'withContact', filters.withContact ? null : '1')}
              >
                {filters.withContact && <Check size={11} aria-hidden="true" />}
                Agent on file
                <span className="tabular-data opacity-70">{contactsAvailable}</span>
              </Chip>
              {/* Said plainly rather than left to be discovered: the agent is
                  present on a minority of records because capture began
                  recently, so this cutting the list hard is expected. */}
              <span className="w-full pt-1 text-2xs leading-relaxed text-neutral-500">
                Councils publish the agent inconsistently, and we only began
                recording it recently.
              </span>
            </Row>
          )}
        </div>
      )}
    </div>
  )
}
