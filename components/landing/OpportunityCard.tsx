// One opportunity, as it appears on the public homepage.
//
// Shows the reasoning but not the number. The scope tags are the scorer's own
// matched criteria — "Drainage / SuDS", "Earthworks / groundworks" — which is
// what demonstrates the product does more than list planning applications. The
// fit score itself stays behind the login, because that ranking is the thing
// being sold.

import { MapPin, CalendarDays } from 'lucide-react'

export interface OpportunityCardData {
  reference: string
  description: string
  address: string | null
  applicationDate: string | null
  status: string | null
  scopes: string[]
  councilName: string
}

function titleCase(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// "3 days ago" beats a date here: recency is the argument, and a reader should
// not have to do arithmetic to feel it.
function whenSubmitted(iso: string | null): string | null {
  if (!iso) return null
  const days = Math.round((Date.now() - new Date(`${iso}T00:00:00Z`).getTime()) / 86_400_000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  return `${Math.round(days / 30)} months ago`
}

export default function OpportunityCard({ item }: { item: OpportunityCardData }) {
  const submitted = whenSubmitted(item.applicationDate)

  return (
    <article className="rounded-md border border-border bg-surface p-3.5 shadow-sm transition-shadow duration-fast ease-standard hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className="tabular-data text-2xs text-ink-muted">{item.reference}</span>
        {item.status && (
          <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-2xs font-medium text-ink-muted">
            {item.status}
          </span>
        )}
      </div>

      <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-ink">{item.description}</p>

      {/* The intelligence layer, made visible. Without these the card is a
          planning record; with them it is an argument for why this one is
          worth a call. */}
      {item.scopes.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {item.scopes.map((s) => (
            <span
              key={s}
              className="rounded-full bg-primary-50 px-2 py-0.5 text-2xs font-medium text-primary-700 ring-1 ring-inset ring-primary-200"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2.5 text-2xs text-neutral-500">
        <div className="flex min-w-0 items-center gap-1">
          <MapPin size={11} aria-hidden="true" className="shrink-0" />
          <dt className="sr-only">Location</dt>
          <dd className="truncate">{item.address || titleCase(item.councilName)}</dd>
        </div>
        {submitted && (
          <div className="flex items-center gap-1">
            <CalendarDays size={11} aria-hidden="true" className="shrink-0" />
            <dt className="sr-only">Submitted</dt>
            <dd>Submitted {submitted}</dd>
          </div>
        )}
      </dl>
    </article>
  )
}
