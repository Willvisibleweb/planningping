// One opportunity as a row inside the results panel.
//
// Distinct from OpportunityCard, which is right for the standalone grid further
// down the page. Stacked cards read as a feed; a panel needs rows — a rank, a
// consistent left edge, metadata aligned in the same place on every line, and
// an affordance on the right. That alignment is most of what separates
// "software" from "a list of things".

import { ChevronRight } from 'lucide-react'

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

export default function OpportunityRow({
  item,
  rank,
}: {
  item: OpportunityRowData
  rank: number
}) {
  const age = whenSubmitted(item.applicationDate)

  return (
    <div className="group grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-3 border-b border-border px-3 py-3 transition-colors duration-fast ease-standard last:border-b-0 hover:bg-primary-50/50">
      {/* Rank, not a bullet. A numbered result set says "this was ordered by
          something", which is the claim the product is making. */}
      <span className="tabular-data mt-0.5 text-2xs font-semibold text-neutral-400">
        {String(rank).padStart(2, '0')}
      </span>

      <div className="min-w-0">
        <p className="line-clamp-1 text-sm font-medium leading-snug text-ink">
          {item.description}
        </p>
        <p className="mt-0.5 truncate text-2xs text-neutral-500">
          <span className="tabular-data">{item.reference}</span>
          {' · '}
          {item.address || titleCase(item.councilName)}
        </p>

        {item.scopes.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.scopes.map((s) => (
              <span
                key={s}
                className="rounded-sm bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-primary-700 ring-1 ring-inset ring-primary-200"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Right rail: the same two facts in the same place on every row, so the
          eye can scan down them instead of hunting. */}
      <div className="flex shrink-0 items-center gap-2.5 pt-0.5">
        <div className="text-right">
          {age && <p className="tabular-data text-2xs font-medium text-ink">{age}</p>}
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
