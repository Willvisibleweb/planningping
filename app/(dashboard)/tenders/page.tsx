// Tenders — work being bought, as opposed to work being planned.
//
// National rather than territory-scoped, and that is a measurement not a
// preference: Contracts Finder publishes ~19 notices a day UK-wide, of which
// about four or five are both locatable and construction-related. Scoped to one
// postcode radius that is roughly one a year. Scoped by discipline nationally
// it is a real feed, and a firm will travel for a £500k contract in a way they
// will not for a £20k one.
//
// Sorted by deadline, not by value or date. A tender you cannot bid for by
// Friday is not an opportunity however large it is, so the question this page
// answers first is "what closes soonest".

import Link from 'next/link'
import { Gavel, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasProAccess, isProfessional } from '@/lib/access'
import ProGate from '@/components/dashboard/ProGate'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'

interface TenderRow {
  ocid: string
  title: string
  description: string | null
  buyer: string | null
  value_gbp: number | null
  classification: string | null
  outward_code: string | null
  published_at: string | null
  closes_at: string | null
  url: string | null
}

function money(v: number | null): string | null {
  if (v === null) return null
  // Rounded to a readable magnitude: nobody bids differently on £535,000 versus
  // £535,412, and the precision implies a confidence the source does not have.
  if (v >= 1_000_000) return `£${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}m`
  if (v >= 1_000) return `£${Math.round(v / 1_000)}k`
  return `£${v.toLocaleString()}`
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.ceil((new Date(`${iso}T00:00:00Z`).getTime() - Date.now()) / 86_400_000)
}

function niceDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00Z`)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`
}

export default async function TendersPage() {
  const profile = await getProfile()
  if (!isProfessional(profile)) return <ProGate variant="homeowner" />
  if (!hasProAccess(profile)) return <ProGate variant="expired" />

  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  // Closed tenders are excluded rather than greyed out. There is nothing to do
  // with one, and leaving them in makes the list look fuller than it is.
  const { data } = await supabase
    .from('tenders')
    .select('*')
    .or(`closes_at.gte.${today},closes_at.is.null`)
    .order('closes_at', { ascending: true, nullsFirst: false })
    .limit(100)

  const tenders = (data ?? []) as TenderRow[]

  return (
    <div className="pp-stagger space-y-6">
      <div>
        <h2 className="mb-1 text-xl font-semibold text-ink">Tenders</h2>
        <p className="text-sm text-ink-muted">
          Construction work being bought by public bodies across the UK, closing
          soonest first. Unlike planning applications these carry a budget and a
          deadline &mdash; and they are national, because only a handful are
          published a day.
        </p>
      </div>

      {tenders.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-surface">
          <EmptyState
            icon={Gavel}
            title="No open tenders right now"
            description="We check Contracts Finder every morning for construction work. Only a few relevant notices are published each day nationally, so quiet spells are normal."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {tenders.map((t) => {
            const days = daysUntil(t.closes_at)
            return (
              <article
                key={t.ocid}
                className="rounded-md border border-border bg-surface p-4 sm:p-5 shadow-sm transition-shadow duration-fast ease-standard hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium leading-snug text-ink">{t.title}</h3>
                    {t.buyer && (
                      <p className="mt-1 text-xs text-ink-muted">{t.buyer}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {money(t.value_gbp) && (
                      <Badge tone="primary" className="tabular-data font-semibold">
                        {money(t.value_gbp)}
                      </Badge>
                    )}
                    {/* Urgency is the point of the badge. A week out is a
                        different decision from a month out, and only the tight
                        ones are worth colouring. */}
                    {days !== null && (
                      <Badge tone={days <= 7 ? 'danger' : days <= 21 ? 'warning' : 'neutral'}>
                        {days <= 0 ? 'Closes today' : `${days} day${days === 1 ? '' : 's'} left`}
                      </Badge>
                    )}
                  </div>
                </div>

                {t.description && (
                  <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">
                    {t.description}
                  </p>
                )}

                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-border pt-3 text-2xs text-ink-muted">
                  {t.outward_code && (
                    <div className="flex gap-1.5">
                      <dt>Location</dt>
                      <dd className="tabular-data font-medium text-ink">{t.outward_code}</dd>
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <dt>Closes</dt>
                    <dd className="tabular-data font-medium text-ink">{niceDate(t.closes_at)}</dd>
                  </div>
                  {t.classification && (
                    <div className="flex min-w-0 gap-1.5">
                      <dt className="shrink-0">Category</dt>
                      <dd className="truncate font-medium text-ink" title={t.classification}>
                        {t.classification}
                      </dd>
                    </div>
                  )}
                </dl>

                {t.url && (
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="pp-link mt-3 inline-flex items-center gap-1 text-xs font-medium"
                  >
                    View the notice
                    <ExternalLink size={11} aria-hidden="true" />
                  </a>
                )}
              </article>
            )
          })}
        </div>
      )}

      <p className="text-2xs leading-relaxed text-neutral-500">
        Source:{' '}
        <Link
          href="https://www.contractsfinder.service.gov.uk"
          target="_blank"
          rel="noopener noreferrer"
          className="pp-link"
        >
          Contracts Finder
        </Link>
        , the government&rsquo;s public procurement service. Always check the
        original notice before bidding &mdash; details change and we mirror what
        was published, not what is current.
      </p>
    </div>
  )
}
