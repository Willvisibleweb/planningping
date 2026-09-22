import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight,
  ClipboardCheck,
  FileSearch,
  MapPinned,
  MessageSquareText,
  Search,
  Sparkles,
  Target,
} from 'lucide-react'
import LandingHeader from '@/components/landing/LandingHeader'
import Reveal from '@/components/landing/Reveal'
import { SITE_URL } from '@/lib/seo/locations'

const TITLE = 'Construction Sales Intelligence Platform UK | PlanningPing'
const DESCRIPTION =
  'PlanningPing is a UK construction sales intelligence platform that turns planning applications into qualified, prioritised project opportunities.'
const CANONICAL = `${SITE_URL}/construction-sales-intelligence`

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: CANONICAL,
    type: 'website',
  },
}

const HERO_PHOTO = {
  src: 'https://s0.geograph.org.uk/geophotos/04/09/88/4098820_0abc3aa7.jpg',
  alt: 'Excavators and concrete drainage pipes on a UK highways construction site.',
  credit: 'Photo: Ian Taylor / Geograph, CC BY-SA 2.0',
  href: 'https://www.geograph.org.uk/photo/4098820',
}

const PROCESS = [
  { title: 'Monitor planning applications', body: 'Track planning activity across the UK authorities and territories that matter to your sales team.' },
  { title: 'Identify construction opportunities', body: 'Filter out low-value noise and surface schemes with signals for civils, groundworks, drainage, highways and structures.' },
  { title: 'Analyse the project', body: 'Read the source record, pull out relevant context, and keep the authority reference visible for verification.' },
  { title: 'Summarise what matters', body: 'Use AI summaries to get from a planning description to a clearer view of the possible opportunity.' },
  { title: 'Score and prioritise', body: 'Rank opportunities by fit so sales teams can start with the projects most worth reviewing.' },
  { title: 'Research and act', body: 'Open the source, review the project team where published, track the opportunity and prepare outreach.' },
]

const AI_POINTS = [
  { icon: Search, title: 'Search by area and scope', body: 'Find planning activity by postcode, town, city or opportunity type instead of reading whole registers manually.' },
  { icon: Sparkles, title: 'Summarise applications', body: 'Turn dense planning descriptions into plain-English opportunity context for quick qualification.' },
  { icon: Target, title: 'Explain fit', body: 'Show why an application may be relevant, including the drainage, groundworks, highways or structural signals behind it.' },
  { icon: MessageSquareText, title: 'Prepare outreach', body: 'Generate a starting point for sales outreach using the project details already in the record.' },
]

const AUDIENCES = [
  'Civil engineering contractors',
  'Groundworks companies',
  'Drainage and SuDS specialists',
  'Construction suppliers',
  'Subcontractors',
  'Business development teams',
  'Pre-construction teams',
  'Owner-managed construction firms',
]

const FAQS = [
  {
    question: 'What is construction sales intelligence?',
    answer:
      'Construction sales intelligence is the process of turning market signals, project data and company information into a clearer view of which construction opportunities are worth pursuing.',
  },
  {
    question: 'How can planning applications generate construction leads?',
    answer:
      'Planning applications often reveal early project intent, location, likely scope, timing and named parties. For contractors and suppliers, those signals can point to opportunities before a tender is widely visible.',
  },
  {
    question: 'How is PlanningPing different from a planning application search tool?',
    answer:
      'A search tool helps you find records. PlanningPing helps qualify them by identifying relevant construction signals, summarising the opportunity and prioritising which projects deserve sales attention.',
  },
  {
    question: 'Who is PlanningPing designed for?',
    answer:
      'PlanningPing is designed for UK construction businesses that want earlier, better-qualified project opportunities, especially civils, groundworks, drainage, subcontractor and supplier teams.',
  },
  {
    question: 'Can construction sales intelligence help civils and groundworks companies?',
    answer:
      'Yes. Planning records can contain strong signals for access roads, drainage, SuDS, remediation, enabling works, foundations and other packages that matter to civils and groundworks teams.',
  },
]

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}

export default function ConstructionSalesIntelligencePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Construction Sales Intelligence', item: CANONICAL },
        ],
      },
      {
        '@type': 'SoftwareApplication',
        name: 'PlanningPing',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: SITE_URL,
        description: DESCRIPTION,
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQS.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
    ],
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <JsonLd data={jsonLd} />
      <LandingHeader />

      <main>
        <section className="relative isolate overflow-hidden border-b border-neutral-900 bg-neutral-950 text-white">
          <Image
            src={HERO_PHOTO.src}
            alt={HERO_PHOTO.alt}
            fill
            priority
            sizes="100vw"
            className="absolute inset-0 -z-20 h-full w-full object-cover opacity-65"
          />
          <div className="absolute inset-0 -z-10 bg-neutral-950/72" />
          <div className="mx-auto grid min-h-[calc(100svh-10rem)] max-w-[1440px] items-center gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[0.95fr_1.05fr]">
            <Reveal>
              <div>
                <p className="inline-flex rounded-sm border border-white/20 bg-white/10 px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-white/80 backdrop-blur">
                  UK construction sales intelligence
                </p>
                <h1 className="mt-4 text-balance text-4xl font-bold leading-[1.03] tracking-tighter text-white sm:text-5xl">
                  Construction Sales Intelligence for UK Contractors
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
                  PlanningPing identifies, qualifies and prioritises opportunities from UK planning data so construction sales teams can spend less time reading registers and more time pursuing the right projects.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link
                    href="/signup?type=professional"
                    className="pp-lift inline-flex h-10 items-center gap-1.5 rounded-sm bg-primary-500 px-5 text-sm font-medium text-white shadow-sm transition-[background-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:bg-primary-600 hover:shadow-primary active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
                  >
                    Start tracking opportunities
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                  <Link
                    href="/planning-applications/coventry"
                    className="pp-lift inline-flex h-10 items-center rounded-sm border border-white/25 bg-white/10 px-5 text-sm font-medium text-white shadow-sm backdrop-blur transition-[background-color,border-color,transform] duration-fast ease-standard hover:-translate-y-px hover:bg-white/15 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
                  >
                    Browse public planning data
                  </Link>
                </div>
                <a
                  href={HERO_PHOTO.href}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex text-2xs text-white/55 underline-offset-2 hover:text-white hover:underline"
                >
                  {HERO_PHOTO.credit}
                </a>
              </div>
            </Reveal>

            <Reveal delayMs={80}>
              <div className="border-l border-white/20 pl-5">
                <p className="text-sm font-semibold text-white">Planning application to sales action</p>
                <ol className="mt-4 space-y-3">
                  {['Planning application', 'Analysed opportunity', 'Qualified lead', 'Sales action'].map((item, index) => (
                    <li key={item} className="flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-white text-sm font-semibold text-neutral-950">
                        {index + 1}
                      </span>
                      <span className="text-sm text-white/80">{item}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="border-b border-border bg-surface">
          <div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
            <Reveal>
              <div>
                <p className="text-2xs font-semibold uppercase tracking-wide text-primary-600">
                  What it means
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tighter text-ink">
                  Construction sales intelligence is qualification, not just data collection.
                </h2>
              </div>
            </Reveal>
            <Reveal delayMs={80}>
              <div className="space-y-4 text-sm leading-relaxed text-ink-muted">
                <p>
                  Construction sales intelligence helps contractors, subcontractors and suppliers identify live or emerging projects, understand why they may matter, and decide where sales attention should go first.
                </p>
                <p>
                  UK planning applications are valuable because they appear early. The problem is volume: most planning records are irrelevant to a commercial construction sales team, and raw registers rarely explain which schemes carry real opportunity.
                </p>
                <p>
                  PlanningPing is built around that gap. It monitors planning activity, identifies construction signals, applies AI analysis where useful, and gives sales teams a prioritised view of projects worth reviewing.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="border-b border-border bg-surface-sunken">
          <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8">
            <Reveal>
              <h2 className="text-2xl font-bold tracking-tighter text-ink">How PlanningPing works</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
                The workflow is designed to move from raw planning activity to a practical sales shortlist.
              </p>
            </Reveal>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PROCESS.map((step, index) => (
                <Reveal key={step.title} delayMs={Math.min(index * 50, 180)}>
                  <li className="h-full rounded-md border border-border bg-surface p-4 shadow-sm">
                    <span className="tabular-data text-2xs font-semibold text-primary-600">0{index + 1}</span>
                    <h3 className="mt-2 text-sm font-semibold text-ink">{step.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{step.body}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-b border-border bg-surface">
          <div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[0.85fr_1.15fr]">
            <Reveal>
              <div>
                <p className="text-2xs font-semibold uppercase tracking-wide text-primary-600">
                  AI lead qualification
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tighter text-ink">
                  Not another list of planning applications.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  PlanningPing uses AI where it helps qualification: summarising applications, explaining relevance, supporting search and preparing outreach. Source references remain visible so a user can verify before acting.
                </p>
              </div>
            </Reveal>
            <div className="grid gap-3 sm:grid-cols-2">
              {AI_POINTS.map((point, index) => (
                <Reveal key={point.title} delayMs={index * 60}>
                  <article className="h-full rounded-md border border-border bg-surface p-4 shadow-sm">
                    <point.icon size={17} className="text-primary-500" aria-hidden="true" />
                    <h3 className="mt-3 text-sm font-semibold text-ink">{point.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{point.body}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-surface-sunken">
          <div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
            <Reveal>
              <div>
                <p className="text-2xs font-semibold uppercase tracking-wide text-primary-600">
                  Who it is for
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tighter text-ink">
                  Built for teams that need early, qualified construction opportunities.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  PlanningPing is especially useful when a team sells into civils, groundworks, drainage, enabling works or construction supply chains and needs to know which planning applications deserve attention.
                </p>
              </div>
            </Reveal>
            <Reveal delayMs={80}>
              <ul className="grid gap-2 sm:grid-cols-2">
                {AUDIENCES.map((item) => (
                  <li key={item} className="flex items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2 text-sm text-ink-muted">
                    <ClipboardCheck size={14} className="shrink-0 text-success-600" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        <section className="border-b border-border bg-surface">
          <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8">
            <Reveal>
              <h2 className="text-2xl font-bold tracking-tighter text-ink">
                From planning data to opportunity intelligence
              </h2>
            </Reveal>
            <div className="mt-6 grid gap-3 md:grid-cols-4">
              {[
                { icon: FileSearch, title: 'Planning application', body: 'A public source record with a reference, description, date, location and status.' },
                { icon: Sparkles, title: 'Analysed opportunity', body: 'The record is checked for construction scope, timing and relevance signals.' },
                { icon: Target, title: 'Qualified lead', body: 'The opportunity is scored and explained so it can be compared with the rest of the territory.' },
                { icon: MapPinned, title: 'Sales action', body: 'The team reviews, tracks, researches and approaches the opportunity where it makes sense.' },
              ].map((item, index) => (
                <Reveal key={item.title} delayMs={index * 60}>
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

        <section className="border-b border-border bg-surface-sunken">
          <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8">
            <Reveal>
              <h2 className="text-2xl font-bold tracking-tighter text-ink">Useful planning application pages</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
                These public pages show the raw planning activity that sits underneath PlanningPing&apos;s construction opportunity intelligence.
              </p>
            </Reveal>
            <div className="mt-5 flex flex-wrap gap-3">
              {[
                { href: '/planning-applications/coventry', label: 'Coventry planning applications' },
                { href: '/planning-applications/nottingham', label: 'Nottingham planning applications' },
                { href: '/planning-applications/westminster', label: 'Westminster planning applications' },
                { href: '/blog/best-construction-sales-intelligence-platforms-uk', label: 'Best construction sales intelligence platforms in the UK' },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-sm border border-border bg-surface px-3 py-2 text-sm font-medium text-ink shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-surface">
          <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8">
            <Reveal>
              <h2 className="text-2xl font-bold tracking-tighter text-ink">Construction sales intelligence FAQ</h2>
            </Reveal>
            <div className="mt-6 divide-y divide-border border-y border-border">
              {FAQS.map((item) => (
                <section key={item.question} className="py-5">
                  <h3 className="text-base font-semibold text-ink">{item.question}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.answer}</p>
                </section>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t border-border">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8">
          <Link href="/" className="text-sm font-semibold text-ink">
            Planning<span className="text-primary-500">Ping</span>
          </Link>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-4 text-xs text-ink-muted">
            <Link href="/blog" className="hover:text-ink">Blog</Link>
            <Link href="/planning-applications/coventry" className="hover:text-ink">UK planning applications</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
