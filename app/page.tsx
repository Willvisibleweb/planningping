// Public homepage.
//
// Product-first rather than brochure-first: the first screen contains a working
// search and real opportunities, not a screenshot. A visitor can answer "what is
// being built near me that I could win work from" before deciding whether to
// sign up, which is the only question this product exists to answer.
//
// Everything shown is real and already public. public_applications is the view
// the SEO pages serve to anonymous crawlers — curated columns, nothing newer
// than seven days. Scope tags come from the scorer's own matched criteria; the
// fit score itself stays behind the login, because the ranking is the thing
// being sold. Nothing here widens what is exposed.

import Link from 'next/link'
import { MapPin, Radar, Target, Send, ArrowRight } from 'lucide-react'
import LandingHeader from '@/components/landing/LandingHeader'
import HeroSearch from '@/components/landing/HeroSearch'
import OpportunityCard from '@/components/landing/OpportunityCard'
import Reveal from '@/components/landing/Reveal'
import CountUp from '@/components/landing/CountUp'
import { getLandingStats } from '@/components/landing/feedData'
import CoverageSection from '@/components/landing/CoverageSection'
import { getCoveragePoints } from '@/lib/analytics/coverageMap'
import { searchArea, getRecentOpportunities, SEARCH_SCOPES } from '@/lib/search/areaSearch'
import { PRICING } from '@/lib/stripe'

// Hourly. This is the most-hit route on the site and must not run its queries
// per visit; an hour-old view of a register that updates once a day is
// indistinguishable from a live one.
export const revalidate = 3600

const SECTOR_USES = [
  { title: 'Groundworks', body: 'Earthworks, excavation and enabling packages, spotted at application rather than at tender.' },
  { title: 'Drainage & SuDS', body: 'Attenuation, surface water and foul strategies named in the documents we read.' },
  { title: 'Civil engineering', body: 'Structures, retaining works and infrastructure across the authorities you cover.' },
  { title: 'Highways & access', body: 'New junctions, access roads and carriageway works, before they reach a framework.' },
]

const FLOW = [
  { icon: Radar, title: 'We read the register', body: 'Every UK planning authority, every morning.' },
  { icon: Target, title: 'We find your scope', body: 'Drainage, groundworks, highways, structures — named in the description.' },
  { icon: MapPin, title: 'We score the fit', body: 'So your team looks at the twelve that matter, not the twelve hundred.' },
  { icon: Send, title: 'You get there first', body: 'With the agent, the deadline and a draft approach ready.' },
]

export default async function HomePage() {
  // All independent — one round of parallel work rather than a waterfall.
  const [stats, recent, seeded, coverage] = await Promise.all([
    getLandingStats(),
    getRecentOpportunities(6),
    // Seeds the hero panel so it is never empty on arrival. Coventry is the
    // deepest dataset we hold, so it shows the product at its best without
    // anything being fabricated.
    searchArea('Coventry'),
    getCoveragePoints(),
  ])

  const scopes = SEARCH_SCOPES.map((s) => ({ id: s.id, label: s.label }))

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <LandingHeader />

      {/* ---------- Hero: search + live opportunities ---------- */}
      <section className="border-b border-border bg-gradient-to-b from-primary-50/70 to-surface">
        <div className="mx-auto max-w-[1440px] px-5 py-10 sm:px-8 sm:py-14">
          <HeroSearch scopes={scopes} initial={seeded.ok ? seeded : null} />
        </div>
      </section>

      {/* ---------- Coverage ---------- */}
      <section id="coverage" className="border-b border-border bg-surface-sunken">
        <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8">
          <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { value: stats.authorities, suffix: '+', label: 'UK planning authorities covered' },
              { value: stats.publicApplications, suffix: '', label: 'applications you can browse now' },
              { value: stats.publicPages, suffix: '', label: 'area pages, no account needed' },
              { value: stats.recentApplications, suffix: '', label: 'published in the last 30 days' },
            ].map((s, i) => (
              <Reveal key={s.label} delayMs={i * 60}>
                <dt className="text-2xl font-semibold tracking-tighter text-ink sm:text-3xl">
                  <CountUp to={s.value} suffix={s.suffix} />
                </dt>
                <dd className="mt-1 text-xs leading-relaxed text-ink-muted">{s.label}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------- National coverage map ---------- */}
      {coverage.length > 0 && (
        <section className="border-b border-border">
          <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8">
            <Reveal>
              <h2 className="text-xl font-bold tracking-tighter text-ink sm:text-2xl">
                Where we&rsquo;re seeing activity
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
                Every authority we hold data for, sized by how much. Add a
                territory anywhere in the UK and it starts filling in the same
                morning.
              </p>
            </Reveal>
            <div className="mt-6">
              <CoverageSection points={coverage} authorities={stats.authorities} />
            </div>
          </div>
        </section>
      )}

      {/* ---------- Recently detected ---------- */}
      {recent.length > 0 && (
        <section className="border-b border-border">
          <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold tracking-tighter text-ink sm:text-2xl">
                    Recently detected opportunities
                  </h2>
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
                    Real applications from the register, with the scope our
                    scoring found in them. Not a screenshot.
                  </p>
                </div>
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 underline-offset-2 hover:underline"
                >
                  See these scored and ranked
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </Reveal>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((o, i) => (
                <Reveal key={o.reference} delayMs={Math.min(i * 50, 200)}>
                  <OpportunityCard item={o} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- How it works ---------- */}
      <section id="how-it-works" className="border-b border-border bg-surface-sunken">
        <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8">
          <Reveal>
            <h2 className="text-xl font-bold tracking-tighter text-ink sm:text-2xl">
              How planning activity becomes pipeline
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
              Every step below is something the system actually does, every
              morning, without anyone asking it to.
            </p>
          </Reveal>

          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FLOW.map((step, i) => (
              <Reveal key={step.title} delayMs={i * 70}>
                <li className="h-full rounded-md border border-border bg-surface p-4 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-sm border border-border bg-primary-100 text-primary-500">
                      <step.icon size={15} aria-hidden="true" />
                    </span>
                    <span className="tabular-data text-2xs font-semibold text-neutral-400">
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-ink">{step.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">{step.body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Who it's for ---------- */}
      <section id="who-its-for" className="border-b border-border">
        <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8">
          <Reveal>
            <h2 className="text-xl font-bold tracking-tighter text-ink sm:text-2xl">
              Built for construction sales
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
              The scoring is tuned for subcontract scope, not for whichever
              scheme is biggest or most newsworthy.
            </p>
          </Reveal>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SECTOR_USES.map((s, i) => (
              <Reveal key={s.title} delayMs={i * 60}>
                <div className="h-full rounded-md border border-border bg-surface p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-ink">{s.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-border bg-primary-50">
        <div className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8">
          <h2 className="text-center text-xl font-semibold text-ink">Pricing</h2>
          <p className="mt-1 text-center text-sm text-ink-muted">
            Start free. Built to pay for itself on the first job you win.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3 max-w-5xl mx-auto">
            <div className="rounded-md border border-border bg-surface p-5 sm:p-7 shadow-sm">
              <h3 className="text-sm font-semibold text-ink">Free</h3>
              <p className="mt-2 text-2xl font-semibold text-ink">Free</p>
              <p className="mt-1 text-xs text-neutral-500">forever</p>
              <ul className="mt-4 space-y-2 text-sm text-ink-muted">
                <li>Track schemes near you</li>
                <li>{PRICING.free.radiusKm}km radius, {PRICING.free.maxAreas} tracked area</li>
                <li>Weekly email digest</li>
              </ul>
              <Link
                href="/signup"
                className="mt-6 block rounded-md border border-primary-500 px-4 py-2 text-center text-sm font-medium text-primary-500 transition-[background-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:bg-primary-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
              >
                Start free
              </Link>
            </div>
            <div className="rounded-md border border-border bg-surface p-5 sm:p-7 shadow-sm">
              <h3 className="text-sm font-semibold text-ink">Pro</h3>
              <p className="mt-2 text-2xl font-semibold text-ink">£{PRICING.mid.monthly.amount}<span className="text-sm font-normal text-ink-muted">/month</span></p>
              <p className="mt-1 text-xs text-neutral-500">or £{PRICING.mid.annual.amount}/year ({PRICING.mid.annual.note}) · {PRICING.trialDays}-day free trial, no card required</p>
              <ul className="mt-4 space-y-2 text-sm text-ink-muted">
                <li>Everything in Free</li>
                <li>Lead scoring, pipeline (CRM), AI outreach</li>
                <li>{PRICING.mid.radiusKm}km radius, {PRICING.mid.maxAreas} tracked areas</li>
                <li>{PRICING.mid.support}</li>
              </ul>
              <Link
                href="/signup?type=professional"
                className="mt-6 block rounded-md border border-primary-500 px-4 py-2 text-center text-sm font-medium text-primary-500 transition-[background-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:bg-primary-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
              >
                Start free trial
              </Link>
            </div>
            <div className="relative rounded-md border-2 border-primary-500 bg-surface p-5 sm:p-6 shadow-sm">
              <span className="absolute -top-2.5 right-5 rounded-full bg-primary-500 px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-white">
                {PRICING.trialDays}-day trial
              </span>
              <h3 className="text-sm font-semibold text-ink">Max</h3>
              <p className="mt-2 text-2xl font-semibold text-ink">£{PRICING.top.monthly.amount}<span className="text-sm font-normal text-ink-muted">/month</span></p>
              <p className="mt-1 text-xs text-neutral-500">or £{PRICING.top.annual.amount}/year ({PRICING.top.annual.note}) · {PRICING.trialDays}-day free trial, no card required</p>
              <ul className="mt-4 space-y-2 text-sm text-ink-muted">
                <li>Everything in Pro</li>
                <li>{PRICING.top.radiusKm}km radius, unlimited tracked areas</li>
                <li>{PRICING.top.support}</li>
              </ul>
              <Link
                href="/signup?type=professional"
                className="mt-6 block rounded-md bg-primary-500 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-primary-600"
              >
                Start free trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}

      {/* ---------- Final CTA: the page ends where it began ---------- */}
      <section className="border-b border-border bg-primary-50">
        <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-xl font-bold tracking-tighter text-ink sm:text-2xl">
              See what&rsquo;s being built in your territory.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              No account needed to look. Start tracking when you want it every
              morning.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="#area-search"
                className="pp-lift inline-flex h-10 items-center gap-1.5 rounded-sm bg-primary-500 px-5 text-sm font-medium text-white shadow-sm transition-[background-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:bg-primary-600 hover:shadow-primary active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
              >
                Search your area
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <Link
                href="/signup"
                className="pp-lift inline-flex h-10 items-center rounded-sm border border-border bg-surface px-5 text-sm font-medium text-ink shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:border-primary-300 hover:bg-primary-50 hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
              >
                Start tracking my territory
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="mt-auto border-t border-border">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8">
          <span className="text-sm font-semibold text-ink">
            Planning<span className="text-primary-500">Ping</span>
          </span>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-4 text-xs text-ink-muted">
            <Link href="/blog" className="hover:text-ink">Blog</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/login" className="hover:text-ink">Sign in</Link>
          </nav>
          <span className="text-xs text-neutral-500">From planning signal to sales pipeline.</span>
        </div>
      </footer>
    </div>
  )
}
