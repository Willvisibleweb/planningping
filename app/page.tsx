import { MapPin, Mail, CheckCircle, Check } from 'lucide-react'
import RotatingWord from '@/components/landing/RotatingWord'
import { PRICING } from '@/lib/stripe'

// Small presentational helpers for the product mockups in the hero / inbox band.
// These are pure markup (no real data) — a "screenshot" of the app rendered in
// the page so visitors see what they get. Kept in this file since they're only
// used here.

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'bad'; children: React.ReactNode }) {
  const tones = {
    ok: 'bg-success-50 text-success-600',
    warn: 'bg-warning-50 text-warning-600',
    bad: 'bg-danger-50 text-danger-600',
  }
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  )
}

function AppRow({
  reference,
  when,
  description,
  address,
  tone,
  status,
}: {
  reference: string
  when: string
  description: string
  address: string
  tone: 'ok' | 'warn' | 'bad'
  status: string
}) {
  return (
    <div className="flex items-start gap-3 border-t border-border py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="tabular-data text-2xs font-semibold text-primary-500">{reference}</span>
          <span className="text-2xs text-neutral-500">{when}</span>
        </div>
        <p className="text-xs leading-snug text-ink">{description}</p>
        <p className="mt-0.5 text-2xs text-neutral-500">{address}</p>
      </div>
      <Pill tone={tone}>{status}</Pill>
    </div>
  )
}

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight text-ink">
            Planning<span className="text-primary-500">Ping</span>
          </span>
          <div className="flex items-center gap-5">
            <a
              href="/blog"
              className="text-sm font-medium text-ink-muted hover:text-ink transition-colors"
            >
              Blog
            </a>
            <a
              href="/login"
              className="text-sm font-medium text-ink-muted hover:text-ink transition-colors"
            >
              Sign in
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-100 via-primary-50 to-surface">
        {/* soft blue glow behind the product mockup */}
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-[460px] w-[460px] rounded-full bg-primary-500/15 blur-3xl" />
        <div className="relative max-w-6xl mx-auto px-6 py-20 w-full">
          <div className="grid items-center gap-14 lg:grid-cols-[1.02fr_1.18fr]">
            {/* Copy */}
            <div className="motion-safe-fade" style={{ animation: 'hero-fade-up 600ms cubic-bezier(.2,.7,.3,1) 100ms both' }}>
              <p className="inline-flex items-center rounded-full border border-border bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-500 mb-5 tracking-wide uppercase">
                UK Planning Application Tracker
              </p>
              <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-ink leading-[1.04] mb-5 text-balance">
                Spot planning applications
                <br />
                for <RotatingWord /> first.
              </h1>
              <p className="text-lg text-ink-muted mb-7 leading-relaxed max-w-lg">
                Track planning applications across any UK council area. Get a weekly digest every Monday — whether you&rsquo;re watching your own street or sourcing new opportunities.
              </p>
              <div className="flex flex-wrap gap-3">
                {/* Flat brand colour rather than the old gradient: this is a
                    data tool, and the primary shadow token already gives the
                    button depth without a colour ramp doing the work. */}
                <a
                  href="/signup"
                  className="pp-lift inline-flex items-center rounded-sm bg-primary-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-[background-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:bg-primary-600 hover:shadow-primary active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
                >
                  Get started free
                </a>
                <a
                  href="/login"
                  className="pp-lift inline-flex items-center rounded-sm border border-border bg-surface px-5 py-2.5 text-sm font-medium text-ink shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:border-primary-300 hover:bg-primary-50 hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
                >
                  Sign in
                </a>
              </div>
              <div className="mt-6 flex items-center gap-2 text-xs text-neutral-500">
                <span className="h-[5px] w-[5px] rounded-full bg-success-600 ring-4 ring-success-50" />
                Covering 20+ councils · new applications every week
              </div>
            </div>

            {/* Dashboard mockup */}
            <div
              className="motion-safe-fade overflow-hidden rounded-lg border border-border bg-surface ring-1 ring-primary-500/10 shadow-lg"
              style={{ animation: 'hero-fade-up 600ms cubic-bezier(.2,.7,.3,1) 250ms both' }}
            >
              <div className="flex h-9 items-center gap-1.5 border-b border-border bg-surface-sunken px-3.5">
                <span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
                <span className="ml-2.5 tabular-data text-2xs text-neutral-500">planningping.app/dashboard</span>
              </div>
              <div className="grid grid-cols-[132px_1fr] sm:grid-cols-[148px_1fr]">
                {/* sidebar */}
                <aside className="border-r border-border bg-surface-sunken p-3">
                  <div className="mb-3.5 px-1 text-xs font-bold tracking-tight text-ink">
                    Planning<span className="text-primary-500">Ping</span>
                  </div>
                  <nav className="flex flex-col gap-0.5 text-xs">
                    <span className="rounded-md bg-primary-100 px-2.5 py-1.5 font-semibold text-primary-500">Dashboard</span>
                    <span className="rounded-md px-2.5 py-1.5 text-ink-muted">Leads</span>
                    <span className="rounded-md px-2.5 py-1.5 text-ink-muted">Pipeline</span>
                    <span className="rounded-md px-2.5 py-1.5 text-ink-muted">Settings</span>
                  </nav>
                  <div className="mt-3.5 rounded-md bg-warning-50 px-2 py-1.5 text-center text-2xs font-semibold text-warning-600">
                    Trial · 9 days left
                  </div>
                </aside>
                {/* main */}
                <div className="p-4">
                  <h2 className="mb-0.5 text-sm font-semibold text-ink">Your tracked areas</h2>
                  <p className="mb-3.5 text-2xs text-neutral-500">Monitored weekly · digest every Monday</p>
                  <div className="rounded-md border border-border bg-surface p-5 shadow-sm">
                    <div className="mb-2.5 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-ink">Croydon town centre</div>
                        <div className="mt-px text-2xs text-neutral-500">CR0 1EA · croydon</div>
                      </div>
                      <Pill tone="warn">6 new</Pill>
                    </div>
                    <AppRow reference="26/01872/TRE" when="29 Jun" tone="warn" status="Awaiting decision"
                      description="Works to trees — reduce height and crown-thin one silver birch."
                      address="Land at Shirley Oaks Road, Croydon" />
                    <AppRow reference="26/01804/FUL" when="27 Jun" tone="ok" status="Approved"
                      description="Single-storey rear extension and loft conversion with rear dormer."
                      address="14 Warham Road, South Croydon" />
                    <AppRow reference="26/01766/HSE" when="24 Jun" tone="bad" status="Refused"
                      description="Two-storey side extension and associated alterations."
                      address="7 Bramley Hill, Croydon" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Inbox band */}
      <section className="border-t border-border bg-primary-50">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-primary-500 mb-3 tracking-wider uppercase">
                Every Monday, 6am
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-ink leading-tight mb-3.5 text-balance">
                The whole week, waiting in your inbox.
              </h2>
              <p className="text-base text-ink-muted leading-relaxed mb-5 max-w-lg">
                No dashboards to check, no portals to trawl. One clean email per area — new applications, status changes and decisions, with the reference, address and description already pulled out.
              </p>
              <ul className="flex flex-col gap-2.5">
                {[
                  'Colour-coded statuses — approved, pending, refused at a glance',
                  'A preview of the top items, the rest one tap away',
                  'Straight to your dashboard from any application',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-sm text-ink">
                    <span className="mt-px grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-success-50 text-success-600">
                      <Check size={11} strokeWidth={3} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Email mockup */}
            <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <span className="text-sm font-semibold tracking-tight text-ink">
                  Planning<span className="text-primary-500">Ping</span>
                </span>
                <span className="text-xs text-neutral-500">to you · notifications@planningping</span>
              </div>
              <div className="px-5 py-[18px]">
                <p className="text-lg font-bold tracking-tight text-ink">5 new planning applications</p>
                <p className="mb-4 text-xs text-ink-muted">
                  Near <strong className="text-ink">SW1A 0RS</strong> — new since your last digest
                </p>
                <div className="mb-2.5 rounded-md border border-border p-4">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="tabular-data text-2xs font-semibold text-primary-500">26/04306/LBC</span>
                    <span className="text-2xs text-neutral-500">30 Jun</span>
                    <span className="ml-auto"><Pill tone="warn">Pending</Pill></span>
                  </div>
                  <p className="mb-0.5 text-xs font-semibold text-ink">16A Bedford Street, London WC2E 9HE</p>
                  <p className="text-xs leading-relaxed text-ink-muted">Replacement shopfront and associated works, including new fenestration, wall lights and a fixed canopy.</p>
                </div>
                <div className="mb-3 rounded-md border border-border p-4">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="tabular-data text-2xs font-semibold text-primary-500">26/03998/FULL</span>
                    <span className="text-2xs text-neutral-500">28 Jun</span>
                    <span className="ml-auto"><Pill tone="ok">Approved</Pill></span>
                  </div>
                  <p className="mb-0.5 text-xs font-semibold text-ink">42 Marsham Street, London SW1P 3EU</p>
                  <p className="text-xs leading-relaxed text-ink-muted">Change of use of ground floor from office to retail with new shopfront.</p>
                </div>
                <span className="block rounded-sm bg-primary-500 py-2.5 text-center text-xs font-semibold text-white">
                  View on your dashboard →
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div>
              <div className="w-9 h-9 rounded-sm bg-primary-100 border border-border flex items-center justify-center mb-4 shadow-sm">
                <MapPin size={16} className="text-primary-500" />
              </div>
              <h3 className="text-sm font-semibold text-ink mb-2">Monitor any area</h3>
              <p className="text-sm text-ink-muted leading-relaxed">
                Add any UK postcode. We resolve the council automatically and start tracking every planning application in that area.
              </p>
            </div>
            <div>
              <div className="w-9 h-9 rounded-sm bg-primary-100 border border-border flex items-center justify-center mb-4 shadow-sm">
                <Mail size={16} className="text-primary-500" />
              </div>
              <h3 className="text-sm font-semibold text-ink mb-2">Weekly digests</h3>
              <p className="text-sm text-ink-muted leading-relaxed">
                Every Monday morning, get a clean email summary of what&apos;s new — application references, addresses, descriptions, and current status.
              </p>
            </div>
            <div>
              <div className="w-9 h-9 rounded-sm bg-primary-100 border border-border flex items-center justify-center mb-4 shadow-sm">
                <CheckCircle size={16} className="text-primary-500" />
              </div>
              <h3 className="text-sm font-semibold text-ink mb-2">Never miss a decision</h3>
              <p className="text-sm text-ink-muted leading-relaxed">
                Status changes and decisions are flagged the moment we detect them — approved, refused, or pending. No manual checking required.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-border bg-primary-50">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-center text-xl font-semibold text-ink">Pricing</h2>
          <p className="mt-1 text-center text-sm text-ink-muted">
            Free for homeowners. Built to pay for itself for professionals.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3 max-w-5xl mx-auto">
            <div className="rounded-md border border-border bg-surface p-7 shadow-sm">
              <h3 className="text-sm font-semibold text-ink">Free</h3>
              <p className="mt-2 text-2xl font-semibold text-ink">Free</p>
              <p className="mt-1 text-xs text-neutral-500">forever</p>
              <ul className="mt-4 space-y-2 text-sm text-ink-muted">
                <li>Track planning applications near you</li>
                <li>{PRICING.free.radiusKm}km radius, {PRICING.free.maxAreas} tracked area</li>
                <li>Weekly email digest</li>
              </ul>
              <a
                href="/signup"
                className="mt-6 block rounded-md border border-primary-500 px-4 py-2 text-center text-sm font-medium text-primary-500 transition-[background-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:bg-primary-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
              >
                Start free
              </a>
            </div>
            <div className="rounded-md border border-border bg-surface p-7 shadow-sm">
              <h3 className="text-sm font-semibold text-ink">Pro</h3>
              <p className="mt-2 text-2xl font-semibold text-ink">£{PRICING.mid.monthly.amount}<span className="text-sm font-normal text-ink-muted">/month</span></p>
              <p className="mt-1 text-xs text-neutral-500">or £{PRICING.mid.annual.amount}/year ({PRICING.mid.annual.note}) · 14-day free trial, no card required</p>
              <ul className="mt-4 space-y-2 text-sm text-ink-muted">
                <li>Everything in Free</li>
                <li>Lead scoring, pipeline (CRM), AI outreach</li>
                <li>{PRICING.mid.radiusKm}km radius, {PRICING.mid.maxAreas} tracked areas</li>
                <li>{PRICING.mid.support}</li>
              </ul>
              <a
                href="/signup?type=professional"
                className="mt-6 block rounded-md border border-primary-500 px-4 py-2 text-center text-sm font-medium text-primary-500 transition-[background-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:bg-primary-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
              >
                Start free trial
              </a>
            </div>
            <div className="relative rounded-md border-2 border-primary-500 bg-surface p-6 shadow-sm">
              <span className="absolute -top-2.5 right-5 rounded-full bg-primary-500 px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-white">
                14-day trial
              </span>
              <h3 className="text-sm font-semibold text-ink">Max</h3>
              <p className="mt-2 text-2xl font-semibold text-ink">£{PRICING.top.monthly.amount}<span className="text-sm font-normal text-ink-muted">/month</span></p>
              <p className="mt-1 text-xs text-neutral-500">or £{PRICING.top.annual.amount}/year ({PRICING.top.annual.note}) · 14-day free trial, no card required</p>
              <ul className="mt-4 space-y-2 text-sm text-ink-muted">
                <li>Everything in Pro</li>
                <li>{PRICING.top.radiusKm}km radius, unlimited tracked areas</li>
                <li>{PRICING.top.support}</li>
              </ul>
              <a
                href="/signup?type=professional"
                className="mt-6 block rounded-md bg-primary-500 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-primary-600"
              >
                Start free trial
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink">PlanningPing</span>
          <span className="text-xs text-neutral-500">Track planning. Stay ahead.</span>
        </div>
      </footer>
    </div>
  )
}
