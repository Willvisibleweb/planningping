// A horizontal bar chart made of divs.
//
// No charting library: this is one flex row and a percentage width per item,
// and pulling in 40kB of JavaScript to draw a rectangle would be a poor trade
// on a page whose whole job is to load quickly and be read.
//
// Bars are scaled against the largest value rather than the total, so the
// shape stays legible when one category dominates — scaling to the total makes
// every minority category a hairline and unreadable.

export interface BarItem {
  label: string
  count: number
}

export default function BarList({
  items,
  total,
  emptyMessage,
}: {
  items: BarItem[]
  /** Denominator for the percentage. Omit to show counts only. */
  total?: number
  emptyMessage: string
}) {
  if (items.length === 0) {
    return <p className="text-xs leading-relaxed text-ink-muted">{emptyMessage}</p>
  }

  const max = Math.max(...items.map((i) => i.count), 1)

  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const share = total && total > 0 ? Math.round((item.count / total) * 100) : null
        return (
          <li key={item.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-xs text-ink">{item.label}</span>
              <span className="tabular-data shrink-0 text-xs text-ink-muted">
                {item.count.toLocaleString()}
                {share !== null && <span className="ml-1.5 text-neutral-500">{share}%</span>}
              </span>
            </div>
            {/* aria-hidden: the figure is already in the text above, so the bar
                is decoration and a screen reader repeating it adds nothing. */}
            <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full bg-primary-500"
                style={{ width: `${Math.max((item.count / max) * 100, 2)}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
