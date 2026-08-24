// How PlanningPing differs from the incumbents.
//
// Every claim here was checked against their own public pages in August 2026,
// and the comparison is deliberately fair rather than flattering. Barbour ABI
// and Glenigan hold far more data than we do and employ research teams; saying
// otherwise would be both untrue and easy to disprove, and a prospect who
// catches one invented claim discards the rest of the page with it.
//
// So the axis is how you buy it and who it is tuned for — which is checkable,
// and is the difference that actually matters to a twelve-person groundworks
// firm. Neither incumbent publishes a price: Barbour ABI has no pricing page at
// all, and Glenigan's says in as many words that it is "difficult to quote
// exact numbers".

import Link from 'next/link'
import { Check, Minus } from 'lucide-react'
import { PRICING } from '@/lib/stripe'

interface Row {
  label: string
  incumbent: string
  us: string
  /** Whether ours is the materially different answer, not merely the nicer one. */
  advantage?: boolean
}

const ROWS: Row[] = [
  {
    label: 'How you buy it',
    incumbent: 'Book a demo, quote on request',
    us: 'Published price, start free, no call',
    advantage: true,
  },
  {
    label: 'Price',
    incumbent: 'Not published',
    us: `From £${PRICING.mid.monthly.amount}/month`,
    advantage: true,
  },
  {
    label: 'Built for',
    incumbent: 'The whole construction market',
    us: 'Civils, groundworks and drainage subcontractors',
    advantage: true,
  },
  {
    label: 'What it tells you',
    incumbent: 'What is being built, in depth',
    us: 'Which schemes carry your scope, and why',
    advantage: true,
  },
  {
    label: 'Depth of data',
    incumbent: 'Larger, with research teams behind it',
    us: 'Planning applications and public tenders',
  },
  {
    label: 'Contract',
    incumbent: 'Typically annual',
    us: 'Monthly, cancel anytime',
    advantage: true,
  },
]

export default function Comparison() {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">
            PlanningPing compared with Barbour ABI and Glenigan
          </caption>
          <thead>
            <tr className="border-b border-border bg-surface-sunken text-left">
              <th scope="col" className="px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                &nbsp;
              </th>
              <th scope="col" className="px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                Barbour ABI · Glenigan
              </th>
              <th scope="col" className="px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-primary-700">
                PlanningPing
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ROWS.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="px-4 py-3 text-left text-xs font-medium text-ink">
                  {r.label}
                </th>
                <td className="px-4 py-3 text-xs leading-relaxed text-ink-muted">{r.incumbent}</td>
                <td className="bg-primary-50/40 px-4 py-3 text-xs leading-relaxed text-ink">
                  <span className="flex items-start gap-1.5">
                    {/* Icon plus text, never colour alone — and the one row
                        where they are genuinely ahead says so with a neutral
                        mark rather than being quietly omitted. */}
                    {r.advantage ? (
                      <Check size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-success-600" />
                    ) : (
                      <Minus size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-neutral-400" />
                    )}
                    <span>{r.us}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-border bg-surface-sunken px-4 py-3 text-2xs leading-relaxed text-neutral-500">
        Checked against their own public pages, August 2026. Barbour ABI
        publishes no pricing page; Glenigan&rsquo;s states it is &ldquo;difficult
        to quote exact numbers&rdquo;. They hold more data than we do &mdash; if
        you need whole-market coverage with a research team behind it, they are
        the right tool. We are for firms who want to know which of this
        week&rsquo;s applications carry drainage or groundworks.{' '}
        <Link href="/signup" className="pp-link font-medium">
          Start free
        </Link>
        .
      </p>
    </div>
  )
}
