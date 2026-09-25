'use client'

// The homepage search, and the panel of results beside it.
//
// The point of putting this here is that a visitor can do the product's core
// job — "what is being built near me that I could win work from" — before
// deciding whether to sign up. It is not a decorative input: it resolves the
// query against the same public location pages the SEO side already serves,
// and shows real applications with the scorer's own matched scopes.
//
// Seeded server-side with a real place so the panel is never empty on arrival.
// An empty product surface on a landing page reads as "nothing here", which is
// the opposite of the intended impression.

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Search, ArrowRight, MapPin, AlertCircle, Sparkles, Target } from 'lucide-react'
import { searchAreaAction } from '@/lib/search/actions'
import type { AreaSearchResult } from '@/lib/search/areaSearch'
import OpportunityRow from './OpportunityRow'
import { Skeleton } from '@/components/ui/Skeleton'
import PlaceInput from '@/components/ui/PlaceInput'
import type { PlaceSuggestion } from '@/lib/places'

interface Props {
  scopes: { id: string; label: string }[]
  /** Rendered on the server so the panel has content before any interaction. */
  initial: Extract<AreaSearchResult, { ok: true }> | null
}

// Free look-ups before signing up.
//
// Friction, not security. Everything the search reaches is on the 183 public
// location pages Google already indexes, so there is nothing here to protect
// with a real gate — and counting client-side means a crawler is never blocked
// and the SEO value is untouched. What this stops is the case where someone
// uses the homepage as an unlimited free lookup tool instead of ever creating
// an account.
//
// The count deliberately does NOT include the server-seeded result: nobody
// should burn a search on something they did not ask for.
const FREE_SEARCHES = 3
const STORAGE_KEY = 'pp:landing-searches'

function readUsed(): number {
  try {
    return Number(window.localStorage.getItem(STORAGE_KEY)) || 0
  } catch {
    // Private browsing throws on access. A visitor we cannot count is a
    // visitor we let search — the alternative is blocking someone who has done
    // nothing wrong.
    return 0
  }
}

export default function HeroSearch({ scopes, initial }: Props) {
  const [query, setQuery] = useState('')
  // The suggestion picked from the list, if any — so the search runs on the
  // exact place chosen rather than re-guessing from the text.
  const [place, setPlace] = useState<PlaceSuggestion | null>(null)
  const [scope, setScope] = useState('')
  const [result, setResult] = useState<AreaSearchResult | null>(
    initial ? initial : null,
  )
  const [used, setUsed] = useState(0)
  const [isPending, startTransition] = useTransition()

  // Read after mount, never during render: localStorage does not exist on the
  // server, and reading it while rendering would desync the markup Next sent.
  //
  // Deferred a frame rather than set in the effect body, which runs during
  // commit and forces a second render before paint. Same pattern as Reveal and
  // CountUp on this page.
  useEffect(() => {
    const id = requestAnimationFrame(() => setUsed(readUsed()))
    return () => cancelAnimationFrame(id)
  }, [])

  const gated = used >= FREE_SEARCHES

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (gated) return
    if (!query.trim()) {
      setResult({ ok: false, reason: 'empty', message: 'Enter a postcode, town or city.' })
      return
    }

    // Counted before the request, so a slow or failed lookup cannot be retried
    // for free — and so the limit cannot be dodged by spamming submit.
    const next = used + 1
    setUsed(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // Nothing to do; the visitor simply is not counted.
    }

    startTransition(async () => {
      setResult(await searchAreaAction(query, scope || undefined, place))
    })
  }

  const showing = result?.ok ? result : null
  const failed = result && !result.ok ? result : null

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)] lg:gap-12">
      {/* ---- Positioning + search ---- */}
      <div className="flex flex-col justify-center">
        <p className="mb-4 inline-flex w-fit items-center rounded-sm border border-white/20 bg-white/10 px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-white/80 backdrop-blur">
          UK construction sales intelligence
        </p>

        {/* Reduced from the previous 6xl. The headline still leads, but the eye
            should move on to the search and then the opportunities rather than
            stopping here. */}
        <h1 className="text-balance text-4xl font-bold leading-[1.03] tracking-tighter text-white sm:text-5xl lg:text-6xl">
          Construction sales intelligence that finds projects worth pursuing.
        </h1>

        <p className="mt-5 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
          PlanningPing monitors UK planning applications, identifies relevant
          civils and groundworks opportunities, and uses AI to prioritise the
          projects most worth your sales team&apos;s time.
        </p>

        <form onSubmit={submit} className="mt-6" noValidate>
          <label htmlFor="area-search" className="sr-only">
            Postcode, town or city
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
              />
              <PlaceInput
                id="area-search"
                value={query}
                onChange={setQuery}
                onSelect={setPlace}
                placeholder="Enter postcode, town or city"
                aria-invalid={failed ? true : undefined}
                aria-describedby={failed ? 'search-error' : undefined}
                className="w-full rounded-sm border border-border-control bg-surface py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-neutral-500 transition-[border-color,box-shadow] duration-fast ease-standard hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15"
              />
            </div>

            <label htmlFor="area-scope" className="sr-only">
              Filter by scope of work
            </label>
            <select
              id="area-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="rounded-sm border border-border-control bg-surface px-3 py-2.5 text-sm text-ink transition-[border-color,box-shadow] duration-fast ease-standard hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 sm:w-44"
            >
              <option value="">Any scope</option>
              {scopes.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>

            <button
              type="submit"
              disabled={isPending || gated}
              className="pp-lift inline-flex h-[42px] shrink-0 items-center justify-center gap-1.5 rounded-sm bg-primary-500 px-4 text-sm font-medium text-white shadow-sm transition-[background-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:bg-primary-600 hover:shadow-primary active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isPending ? 'Searching…' : 'Search opportunities'}
              {!isPending && <ArrowRight size={14} aria-hidden="true" />}
            </button>
          </div>

          {failed && (
            <p id="search-error" role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-danger-600">
              <AlertCircle size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
              {failed.message}
            </p>
          )}

          <p className="mt-2 text-2xs text-white/60">
            {gated ? (
              <>
                You&rsquo;ve used your {FREE_SEARCHES} free look-ups.{' '}
                <Link href="/signup" className="font-medium text-white underline underline-offset-2 hover:text-white/80">
                  Create a free account
                </Link>{' '}
                to keep searching.
              </>
            ) : used >= FREE_SEARCHES - 1 ? (
              <>
                {FREE_SEARCHES - used} free look-up left &mdash; no account
                needed.
              </>
            ) : (
              <span className="text-white/60">
                Try Stoke-on-Trent, Liverpool or ST13 &mdash; no account needed to look.
              </span>
            )}
          </p>
        </form>
      </div>

      {/* ---- Live opportunity panel ---- */}
      <div className="overflow-hidden rounded-lg border border-primary-200 bg-surface shadow-lg">
        {isPending ? (
          <div aria-live="polite">
            <div className="flex items-center justify-between border-b border-border bg-surface-sunken px-3 py-2.5">
              <span className="text-xs font-semibold text-ink">Searching&hellip;</span>
              <span className="tabular-data text-2xs text-neutral-500">&mdash;</span>
            </div>
            <div className="space-y-3 p-3">
            {[0, 1, 2].map((i) => (
              // Shaped like the card it stands in for, so the panel holds its
              // layout and nothing jumps when results land.
              <div key={i} className="rounded-md border border-border bg-surface p-3.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-3.5 w-full" />
                <Skeleton className="mt-1.5 h-3.5 w-3/4" />
                <Skeleton className="mt-3 h-3 w-1/2" />
              </div>
            ))}
            </div>
          </div>
        ) : gated ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-semibold text-ink">
              That&rsquo;s your {FREE_SEARCHES} free look-ups
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-ink-muted">
              A free account keeps the search open, and adds the part this page
              deliberately holds back: every scheme scored for your trade, so
              you know which of them is worth a call.
            </p>
            <Link
              href="/signup"
              className="pp-lift mt-4 inline-flex h-9 items-center gap-1.5 rounded-sm bg-primary-500 px-4 text-sm font-medium text-white shadow-sm transition-[background-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:bg-primary-600 hover:shadow-primary active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
            >
              Create a free account
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
            {/* The public pages stay open — the cap is on this search box, not
                on the data, and pretending otherwise would be a lie a visitor
                can disprove with one click. */}
            <p className="mt-3 text-2xs text-neutral-500">
              Or keep browsing the{' '}
              <Link href="/planning-applications/coventry" className="pp-link">
                public area pages
              </Link>
              , which stay open to everyone.
            </p>
          </div>
        ) : showing ? (
          <>
            <div className="border-b border-border bg-primary-50 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-primary-700">
                    <Sparkles size={12} aria-hidden="true" />
                    Example PlanningPing output
                  </p>
                  <h2 className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-base font-bold tracking-tight text-ink">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <MapPin size={15} className="shrink-0 text-primary-500" aria-hidden="true" />
                      Planning applications turned into ranked sales leads in {showing.placeName}
                    </span>
                  </h2>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted">
                    Each row shows the likely work package, the matched trade
                    signals and the timing. We scanned {showing.total.toLocaleString()} planning records and found{' '}
                    <strong className="font-semibold text-ink">
                      {showing.relevant.toLocaleString()} potential opportunities
                    </strong>{' '}
                    matching civils, groundworks, drainage or enabling-work signals.
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-2xs font-semibold text-success-700 ring-1 ring-inset ring-success-200">
                  <Target size={11} aria-hidden="true" />
                  Sorted by fit
                </span>
              </div>
            </div>

            {showing.preview.length > 0 ? (
              <div>
                {showing.preview.map((p, i) => (
                  <OpportunityRow key={p.reference} item={p} rank={i + 1} />
                ))}
              </div>
            ) : (
              // A real and common state — plenty of authorities publish nothing
              // carrying civils scope in a given window. Saying so is better
              // than an empty box, and better than pretending otherwise.
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-ink">
                  Nothing carrying your scope here yet
                </p>
                <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-ink-muted">
                  We hold {showing.total.toLocaleString()} applications for{' '}
                  {showing.placeName}, but none of the recent ones match that
                  trade. Try another scope or a nearby area.
                </p>
              </div>
            )}

            {showing.preview.length > 0 && (
              <div className="grid gap-2 border-t border-border bg-primary-50/55 px-4 py-3 sm:grid-cols-3">
                {[
                  ['Likely package', 'What a civils or groundworks team could sell into.'],
                  ['Matched signals', 'The words and conditions that made the application relevant.'],
                  ['Fit order', 'The examples are shown in the order PlanningPing would open first.'],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-md bg-surface p-2.5 ring-1 ring-inset ring-primary-100">
                    <p className="text-[10px] font-semibold uppercase text-primary-700">
                      {title}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-ink-muted">
                      {body}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-sunken px-4 py-3">
              <span className="text-2xs leading-relaxed text-neutral-500">
                Showing {showing.preview.length} ranked examples. Create an account to see scores,
                project teams, recommended first contact and the full saved pipeline.
              </span>
              <div className="flex items-center gap-2">
                <Link
                  href={showing.href}
                  className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-sm transition-[background-color,border-color] duration-fast ease-standard hover:border-primary-300 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
                >
                  View all in {showing.placeName}
                  <ArrowRight size={12} aria-hidden="true" />
                </Link>
                <Link
                  href="/signup"
                  className="text-xs font-medium text-primary-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
                >
                  Track this area &rarr;
                </Link>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
