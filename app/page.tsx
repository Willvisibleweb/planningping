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
import Image from 'next/image'
import type { Metadata } from 'next'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  FileSearch,
  GitBranch,
  HardHat,
  MapPinned,
  MapPin,
  Milestone,
  Radar,
  Send,
  ShieldCheck,
  Target,
  Tractor,
} from 'lucide-react'
import LandingHeader from '@/components/landing/LandingHeader'
import HeroSearch from '@/components/landing/HeroSearch'
import OpportunityCard from '@/components/landing/OpportunityCard'
import Reveal from '@/components/landing/Reveal'
import CountUp from '@/components/landing/CountUp'
import { getLandingStats } from '@/components/landing/feedData'
import CoverageSection from '@/components/landing/CoverageSection'
import Comparison from '@/components/landing/Comparison'
import { getCoveragePoints } from '@/lib/analytics/coverageMap'
import { searchArea, getRecentOpportunities, SEARCH_SCOPES } from '@/lib/search/areaSearch'
import { PRICING } from '@/lib/stripe'
import { SITE_URL } from '@/lib/seo/locations'

// Hourly. This is the most-hit route on the site and must not run its queries
// per visit; an hour-old view of a register that updates once a day is
// indistinguishable from a live one.
export const revalidate = 3600

const HOME_TITLE = 'PlanningPing | Construction Sales Intelligence UK'
const HOME_DESCRIPTION =
  'PlanningPing turns UK planning applications into qualified construction sales opportunities, using AI to identify, analyse and prioritise projects worth pursuing.'
const HOME_URL = SITE_URL

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  alternates: { canonical: HOME_URL },
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: HOME_URL,
    type: 'website',
  },
}

const HERO_PHOTO = {
  src: 'https://s0.geograph.org.uk/geophotos/04/09/88/4098820_0abc3aa7.jpg',
  alt: 'Drainage works beside the Heysham to M6 link road, with excavators and concrete pipes on site.',
  credit: 'Photo: Ian Taylor / Geograph, CC BY-SA 2.0',
  href: 'https://www.geograph.org.uk/photo/4098820',
}

const SECTORS = [
  {
    title: 'Residential Development',
    body: 'New estates, reserved matters, discharge of conditions, access roads, drainage strategy and plot infrastructure.',
    image: 'https://www.stonewater.org/media/y1mnbou2/berry-croft-east-sussex.jpg',
    alt: 'Excavator and dumper working on a rural housing development.',
    credit: 'Sector image: Stonewater',
    href: 'https://www.stonewater.org/about-us/building-homes/building-rural-communities/',
  },
  {
    title: 'Commercial & Industrial',
    body: 'Warehousing, employment land, mixed-use schemes, steel frames, service yards and enabling packages.',
    image: 'https://images.skyscrapercenter.com/building/CentralSaintGiles_Con-TO_%28CC__BY%29Damo1977220121-080142.jpg',
    alt: 'Commercial construction in London with cranes above a partly complete building.',
    credit: 'Sector image: Damo1977 / CC BY',
    href: 'https://www.skyscrapercenter.com/building/matilda-apartments/42633',
  },
  {
    title: 'Civils & Infrastructure',
    body: 'Highways works, SuDS, culverts, retaining structures, utilities, public realm and rail-adjacent work.',
    image: 'https://assets.publishing.service.gov.uk/media/5bbb54b2ed915d238f9cc2ee/s960_a66.jpg',
    alt: 'Roadworks trench on the A66 with safety barriers and site workers.',
    credit: 'Sector image: National Highways / GOV.UK',
    href: 'https://www.gov.uk/government/news/roman-settlement-discovered-during-a66-eden-valley-works',
  },
]

const FLOW = [
  { icon: Radar, title: 'Planning registers update', body: 'New and changed UK applications are collected from the authorities in your patch.' },
  { icon: FileSearch, title: 'Scope is pulled out', body: 'Descriptions, documents and conditions are checked for groundworks, drainage, highways and structures.' },
  { icon: Target, title: 'Projects are prioritised', body: 'The list is scored for civils relevance, location and timing so sales time goes where it has a chance.' },
  { icon: Send, title: 'Your team acts', body: 'Open the record, check the agent, track the lead and approach before the tender noise starts.' },
]

const TRUST_POINTS = [
  { icon: ShieldCheck, title: 'Public planning sources', body: 'References, authorities and application dates stay visible so a lead can be checked back to the register.' },
  { icon: BadgeCheck, title: 'No invented market theatre', body: 'No fake testimonials, mystery user counts or unsupported national claims. The page uses the data we can defend.' },
  { icon: MapPinned, title: 'Built around UK territories', body: 'The product starts with the patch your sales team can actually cover, then expands from there.' },
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
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${HOME_URL}/#organization`,
        name: 'PlanningPing',
        url: HOME_URL,
        email: 'william.kelwave@gmail.com',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${HOME_URL}/#software`,
        name: 'PlanningPing',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: HOME_URL,
        description: HOME_DESCRIPTION,
        publisher: { '@id': `${HOME_URL}/#organization` },
      },
      {
        '@type': 'WebSite',
        '@id': `${HOME_URL}/#website`,
        name: 'PlanningPing',
        url: HOME_URL,
        publisher: { '@id': `${HOME_URL}/#organization` },
      },
    ],
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <LandingHeader />

      {/* ---------- Hero: construction context + live opportunities ---------- */}
      <section className="relative isolate overflow-hidden border-b border-neutral-900 bg-neutral-950 text-white">
        <Image
          src={HERO_PHOTO.src}
          alt={HERO_PHOTO.alt}
          fill
          preload
          sizes="100vw"
          className="absolute inset-0 -z-20 h-full w-full object-cover opacity-70"
        />
        <div className="absolute inset-0 -z-10 bg-neutral-950/70" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-transparent" />

        <div className="mx-auto flex min-h-[calc(100svh-7rem)] max-w-[1440px] items-center px-5 py-12 sm:px-8 sm:py-16">
          <div className="w-full">
            <HeroSearch scopes={scopes} initial={seeded.ok ? seeded : null} />
            <a
              href={HERO_PHOTO.href}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex text-2xs text-white/60 underline-offset-2 hover:text-white hover:underline"
            >
              {HERO_PHOTO.credit}
            </a>
          </div>
        </div>
      </section>

      {/* ---------- Real activity strip ---------- */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-[1440px] gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <Reveal>
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wide text-primary-600">
                Real public planning signal
              </p>
              <h2 className="mt-2 max-w-xl text-xl font-bold tracking-tighter text-ink sm:text-2xl">
                A live view of the construction activity already sitting in planning records.
              </h2>
            </div>
          </Reveal>

          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { icon: Building2, value: stats.authorities, suffix: '+', label: 'UK planning authorities covered' },
              { icon: FileSearch, value: stats.publicApplications, suffix: '', label: 'public applications browsable now' },
              { icon: MapPin, value: stats.publicPages, suffix: '', label: 'open area pages' },
              { icon: CalendarDays, value: stats.recentApplications, suffix: '', label: 'published in the last 30 days' },
            ].map((s, i) => (
              <Reveal key={s.label} delayMs={i * 60}>
                <div className="h-full border-l border-border pl-3">
                  <s.icon size={15} className="mb-2 text-primary-500" aria-hidden="true" />
                  <dt className="text-2xl font-semibold tracking-tighter text-ink sm:text-3xl">
                    <CountUp to={s.value} suffix={s.suffix} />
                  </dt>
                  <dd className="mt-1 text-xs leading-relaxed text-ink-muted">{s.label}</dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------- National coverage map ---------- */}
      {coverage.length > 0 && (
        <section id="coverage" className="border-b border-border bg-surface-sunken">
          <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8">
            <Reveal>
              <h2 className="text-xl font-bold tracking-tighter text-ink sm:text-2xl">
                Where PlanningPing is seeing activity
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
                Every authority currently loaded in the public dataset, sized by
                application volume. It is a coverage picture, not a claim that
                every possible lead is already on this page.
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
                    What PlanningPing finds
                  </h2>
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
                    Real public applications from the register, translated into
                    sales opportunities with the likely package and matched
                    civils signals made visible.
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

      {/* ---------- Construction sectors ---------- */}
      <section id="who-its-for" className="border-b border-border">
        <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8">
          <Reveal>
            <h2 className="text-xl font-bold tracking-tighter text-ink sm:text-2xl">
              Built around the work, not the software category
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
              The page a sales manager needs is not another AI dashboard. It is
              a sharp read on which planning records point to real packages in
              the sectors their team can win.
            </p>
          </Reveal>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {SECTORS.map((s, i) => (
              <Reveal key={s.title} delayMs={i * 60}>
                <article className="h-full overflow-hidden rounded-md border border-border bg-surface shadow-sm">
                  <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
                    <Image
                      src={s.image}
                      alt={s.alt}
                      fill
                      sizes="(max-width: 1024px) 100vw, 33vw"
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-slow ease-standard hover:scale-[1.025]"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-neutral-950/70 to-transparent p-3">
                      <h3 className="text-base font-semibold text-white">{s.title}</h3>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-sm leading-relaxed text-ink-muted">{s.body}</p>
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex text-2xs text-neutral-500 underline-offset-2 hover:text-ink hover:underline"
                    >
                      {s.credit}
                    </a>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Product intelligence ---------- */}
      <section className="border-b border-border bg-surface-sunken">
        <div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <Reveal>
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wide text-primary-600">
                The intelligence layer
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-tighter text-ink sm:text-2xl">
                Planning records are public. Knowing which ones matter is the product.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">
                A council register tells you an application exists. PlanningPing
                turns that public record into construction sales intelligence:
                scope, timing, place, agent and next action, all kept close to
                the original source.
              </p>
              <Link
                href="/construction-sales-intelligence"
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-600 underline-offset-2 hover:underline"
              >
                Learn about construction sales intelligence
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </Reveal>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: HardHat, title: 'Civils relevance', body: 'Groundworks, drainage, SuDS, highways and structures are treated as selling signals, not search keywords.' },
              { icon: Tractor, title: 'Scope reasoning', body: 'Matched scope tags show why a record has been surfaced before the numerical score is revealed inside the app.' },
              { icon: GitBranch, title: 'Pipeline-ready', body: 'Track a lead from first sighting to outreach, follow-up and won or lost without leaving the opportunity.' },
              { icon: Milestone, title: 'Territory-first', body: 'Search and monitoring begin with the towns, postcodes and authorities your team can actually serve.' },
            ].map((item, i) => (
              <Reveal key={item.title} delayMs={i * 60}>
                <article className="h-full rounded-md border border-border bg-surface p-4 shadow-sm">
                  <item.icon size={17} className="text-primary-500" aria-hidden="true" />
                  <h3 className="mt-3 text-sm font-semibold text-ink">{item.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{item.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Trust and company ---------- */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <Reveal>
              <div>
                <p className="text-2xs font-semibold uppercase tracking-wide text-primary-600">
                  UK-built, source-led
                </p>
                <h2 className="mt-2 text-xl font-bold tracking-tighter text-ink sm:text-2xl">
                  Small enough to be accountable. Serious enough to be checked.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">
                  PlanningPing is operated in the UK by William Kelsall /
                  Planning Ping, trading as Kelwave. Questions go to the same
                  place as the legal pages: william.kelwave@gmail.com.
                </p>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">
                  The standard is simple: planning intelligence should be useful
                  enough to act on and transparent enough to verify.
                </p>
              </div>
            </Reveal>

            <div className="grid gap-3 sm:grid-cols-3">
              {TRUST_POINTS.map((point, i) => (
                <Reveal key={point.title} delayMs={i * 60}>
                  <article className="h-full rounded-md border border-border bg-surface p-4 shadow-sm">
                    <point.icon size={17} className="text-success-600" aria-hidden="true" />
                    <h3 className="mt-3 text-sm font-semibold text-ink">{point.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{point.body}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- How we compare ---------- */}
      <section className="border-b border-border bg-surface-sunken">
        <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8">
          <Reveal>
            <h2 className="text-xl font-bold tracking-tighter text-ink sm:text-2xl">
              How we compare
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
              Barbour ABI and Glenigan are the established names. They are
              bigger than us and we are not pretending otherwise &mdash; the
              difference is who the product is tuned for, and how you buy it.
            </p>
          </Reveal>
          <div className="mt-6">
            <Comparison />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border bg-surface">
        <div className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8">
          <h2 className="text-center text-xl font-semibold text-ink">Pricing</h2>
          <p className="mt-1 text-center text-sm text-ink-muted">
            Start free. Upgrade when the scored pipeline is worth tracking every morning.
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
            <Link href="/construction-sales-intelligence" className="hover:text-ink">Construction sales intelligence</Link>
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
