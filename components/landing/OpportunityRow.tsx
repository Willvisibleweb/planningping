// One opportunity as a row inside the results panel.
//
// Distinct from OpportunityCard, which is right for the standalone grid further
// down the page. Stacked cards read as a feed; a panel needs rows — a rank, a
// consistent left edge, metadata aligned in the same place on every line, and
// an affordance on the right. That alignment is most of what separates
// "software" from "a list of things".

import { CalendarDays, ChevronRight, MapPin, Target } from 'lucide-react'

export interface OpportunityRowData {
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

function whenSubmitted(iso: string | null): string | null {
  if (!iso) return null
  const days = Math.round((Date.now() - new Date(`${iso}T00:00:00Z`).getTime()) / 86_400_000)
  if (days < 1) return 'today'
  if (days === 1) return '1d'
  if (days < 60) return `${days}d`
  return `${Math.round(days / 30)}mo`
}

function packageFromScopes(scopes: string[]): string {
  const text = scopes.join(' ').toLowerCase()
  if (/drainage|suds|flood|water/.test(text)) return 'Drainage / water package'
  if (/earthworks|groundworks/.test(text)) return 'Groundworks package'
  if (/infrastructure|enabling|highway|road/.test(text)) return 'Infrastructure package'
  if (/demolition|remediation/.test(text)) return 'Enabling works package'
  if (/structure|foundation|retaining/.test(text)) return 'Structures package'
  return 'Construction package'
}

export default function OpportunityRow({
  item,
  rank,
}: {
  item: OpportunityRowData
  rank: number
}) {
  const age = whenSubmitted(item.applicationDate)
  const packageLabel = packageFromScopes(item.scopes)

  return (
    <div className="group grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-3 border-b border-border px-3 py-3.5 transition-colors duration-fast ease-standard last:border-b-0 hover:bg-primary-50/60">
      <div className="flex flex-col items-center gap-1">
        <span className="grid size-8 place-items-center rounded-full bg-primary-500 text-xs font-semibold text-white shadow-primary">
          {rank}
        </span>
        <span className="text-[9px] font-semibold uppercase text-primary-600">
          Fit
        </span>
      </div>

      <div className="min-w-0">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-semibold text-success-700 ring-1 ring-inset ring-success-200">
            <Target size={10} aria-hidden="true" />
            AI-ranked lead
          </span>
          <span className="rounded-full bg-warning-50 px-2 py-0.5 text-[10px] font-semibold text-warning-700 ring-1 ring-inset ring-warning-200">
            Likely package: {packageLabel}
          </span>
        </div>

        <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
          {item.description}
        </p>

        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-neutral-500">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin size={11} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{item.address || titleCase(item.councilName)}</span>
          </span>
          <span className="tabular-data">{item.reference}</span>
        </div>

        {item.scopes.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] font-semibold uppercase text-neutral-500">
              Matched trade signals
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {item.scopes.map((s) => (
                <span
                  key={s}
                  className="rounded-sm bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-primary-700 ring-1 ring-inset ring-primary-200"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right rail: the same two facts in the same place on every row, so the
          eye can scan down them instead of hunting. */}
      <div className="flex shrink-0 items-center gap-2.5 pt-0.5">
        <div className="text-right">
          {age && (
            <p className="inline-flex items-center gap-1 tabular-data text-2xs font-medium text-ink">
              <CalendarDays size={11} aria-hidden="true" />
              {age}
            </p>
          )}
          {item.status && (
            <p className="mt-0.5 max-w-[7rem] truncate text-[10px] leading-4 text-neutral-500">
              {item.status}
            </p>
          )}
        </div>
        <ChevronRight
          size={14}
          aria-hidden="true"
          className="shrink-0 text-neutral-300 transition-[color,transform] duration-fast ease-standard group-hover:translate-x-0.5 group-hover:text-primary-500"
        />
      </div>
    </div>
  )
}
