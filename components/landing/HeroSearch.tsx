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
import { Search, ArrowRight, MapPin, AlertCircle } from 'lucide-react'
import { searchAreaAction } from '@/lib/search/actions'
import type { AreaSearchResult } from '@/lib/search/areaSearch'
import OpportunityRow from './OpportunityRow'
import { Skeleton } from '@/components/ui/Skeleton'

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
      setResult(await searchAreaAction(query, scope || undefined))
    })
  }

  const showing = result?.ok ? result : null
  const failed = result && !result.ok ? result : null

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)] lg:gap-12">
      {/* ---- Positioning + search ---- */}
      <div className="flex flex-col justify-center">
        <p className="mb-4 inline-flex w-fit items-center rounded-full border border-border bg-primary-100 px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-primary-600">
          Construction sales intelligence
        </p>

        {/* Reduced from the previous 6xl. The headline still leads, but the eye
            should move on to the search and then the opportunities rather than
            stopping here. */}
        <h1 className="text-balance text-3xl font-bold leading-[1.08] tracking-tighter text-ink sm:text-4xl lg:text-[2.9rem]">
          Find the work in your patch
          <br />
          before your competitors.
        </h1>

        <p className="mt-4 max-w-lg text-base leading-relaxed text-ink-muted">
          We read every UK planning authority daily, work out which schemes carry
          your scope &mdash; drainage, groundworks, highways, structures &mdash;
          and tell your team which ones are worth a call.
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
              <input
                id="area-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter postcode, town or city"
                autoComplete="postal-code"
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

          <p className="mt-2 text-2xs text-neutral-500">
            {gated ? (
              <>
                You&rsquo;ve used your {FREE_SEARCHES} free look-ups.{' '}
                <Link href="/signup" className="pp-link font-medium">
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
              <>Try ST13, Coventry or Bristol &mdash; no account needed to look.</>
            )}
          </p>
        </form>
      </div>

      {/* ---- Live opportunity panel ---- */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-md">
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-sunken px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <MapPin size={14} className="shrink-0 text-primary-500" aria-hidden="true" />
                <h2 className="truncate text-sm font-semibold text-ink">
                  {showing.placeName}
                </h2>
                <span
                  aria-live="polite"
                  className="tabular-data shrink-0 rounded-full bg-primary-100 px-2 py-0.5 text-2xs font-semibold text-primary-700"
                >
                  {showing.relevant.toLocaleString()} with your scope
                </span>
              </div>
              {/* Says what the ordering is. A ranked list whose ordering is
                  unstated is just a list. */}
              <span className="shrink-0 text-2xs text-neutral-500">Sorted by fit</span>
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

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-sunken px-3 py-2.5">
              <span className="tabular-data text-2xs text-neutral-500">
                Showing {showing.preview.length} of {showing.relevant.toLocaleString()}
                {' · '}
                {showing.total.toLocaleString()} tracked in {showing.placeName}
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
