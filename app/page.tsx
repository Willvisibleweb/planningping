import { MapPin, Mail, CheckCircle, Check } from 'lucide-react'
import RotatingWord from '@/components/landing/RotatingWord'

// Small presentational helpers for the product mockups in the hero / inbox band.
// These are pure markup (no real data) — a "screenshot" of the app rendered in
// the page so visitors see what they get. Kept in this file since they're only
// used here.

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'bad'; children: React.ReactNode }) {
  const tones = {
    ok: 'bg-[#ECFDF5] text-[#047857]',
    warn: 'bg-[#FFFBEB] text-[#B45309]',
    bad: 'bg-[#FEF2F2] text-[#B91C1C]',
  }
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}>
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
    <div className="flex items-start gap-3 border-t border-[#E5E7EB] py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="font-mono text-[11px] font-semibold text-[#2563EB]">{reference}</span>
          <span className="text-[10px] text-[#9CA3AF]">{when}</span>
        </div>
        <p className="text-xs leading-snug text-[#111827]">{description}</p>
        <p className="mt-0.5 text-[10px] text-[#9CA3AF]">{address}</p>
      </div>
      <Pill tone={tone}>{status}</Pill>
    </div>
  )
}

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Nav */}
      <header className="border-b border-[#E5E7EB]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight text-[#111827]">
            Planning<span className="text-[#2563EB]">Ping</span>
          </span>
          <a
            href="/login"
            className="text-sm font-medium text-[#6B7280] hover:text-[#111827] transition-colors"
          >
            Sign in
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#EEF3FF] via-[#F6F9FF] to-white">
        {/* soft blue glow behind the product mockup */}
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-[460px] w-[460px] rounded-full bg-[#2563EB]/15 blur-3xl" />
        <div className="relative max-w-6xl mx-auto px-6 py-20 w-full">
          <div className="grid items-center gap-14 lg:grid-cols-[1.02fr_1.18fr]">
            {/* Copy */}
            <div className="motion-safe-fade" style={{ animation: 'hero-fade-up 600ms cubic-bezier(.2,.7,.3,1) 100ms both' }}>
              <p className="inline-flex items-center rounded-full border border-[#DCE7FF] bg-[#EFF4FF] px-3 py-1 text-xs font-semibold text-[#2563EB] mb-5 tracking-wide uppercase">
                UK Planning Application Tracker
              </p>
              <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-[#111827] leading-[1.04] mb-5 text-balance">
                Spot planning applications
                <br />
                for <RotatingWord /> first.
              </h1>
              <p className="text-lg text-[#6B7280] mb-7 leading-relaxed max-w-lg">
                Track planning applications across any UK council area. Get a weekly digest every Monday — whether you&rsquo;re watching your own street or sourcing new opportunities.
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="/signup"
                  className="inline-flex items-center px-5 py-2.5 rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] text-sm font-medium text-white shadow-sm shadow-blue-600/25 transition-[transform,box-shadow,background] hover:from-[#2563EB] hover:to-[#1D4ED8] hover:-translate-y-px hover:shadow-md hover:shadow-blue-600/40"
                >
                  Get started free
                </a>
                <a
                  href="/login"
                  className="inline-flex items-center px-5 py-2.5 rounded-md border border-[#E5E7EB] bg-white text-sm font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors"
                >
                  Sign in
                </a>
              </div>
              <div className="mt-6 flex items-center gap-2 text-[13px] text-[#9CA3AF]">
                <span className="h-[5px] w-[5px] rounded-full bg-[#047857] ring-4 ring-[#ECFDF5]" />
                Covering 20+ councils · new applications every week
              </div>
            </div>

            {/* Dashboard mockup */}
            <div
              className="motion-safe-fade overflow-hidden rounded-2xl border border-[#DCE7FF] bg-white ring-1 ring-[#2563EB]/10 shadow-[0_1px_2px_rgba(16,24,40,.04),0_24px_48px_-16px_rgba(37,99,235,.28)]"
              style={{ animation: 'hero-fade-up 600ms cubic-bezier(.2,.7,.3,1) 250ms both' }}
            >
              <div className="flex h-9 items-center gap-1.5 border-b border-[#E5E7EB] bg-[#F9FAFB] px-3.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#E5E7EB]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#E5E7EB]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#E5E7EB]" />
                <span className="ml-2.5 font-mono text-[11px] text-[#9CA3AF]">planningping.app/dashboard</span>
              </div>
              <div className="grid grid-cols-[132px_1fr] sm:grid-cols-[148px_1fr]">
                {/* sidebar */}
                <aside className="border-r border-[#E5E7EB] bg-[#F9FAFB] p-3">
                  <div className="mb-3.5 px-1 text-xs font-bold tracking-tight text-[#111827]">
                    Planning<span className="text-[#2563EB]">Ping</span>
                  </div>
                  <nav className="flex flex-col gap-0.5 text-[12.5px]">
                    <span className="rounded-md bg-[#EFF4FF] px-2.5 py-1.5 font-semibold text-[#2563EB]">Dashboard</span>
                    <span className="rounded-md px-2.5 py-1.5 text-[#6B7280]">Leads</span>
                    <span className="rounded-md px-2.5 py-1.5 text-[#6B7280]">Pipeline</span>
                    <span className="rounded-md px-2.5 py-1.5 text-[#6B7280]">Settings</span>
                  </nav>
                  <div className="mt-3.5 rounded-md bg-[#FFFBEB] px-2 py-1.5 text-center text-[10.5px] font-semibold text-[#B45309]">
                    Trial · 9 days left
                  </div>
                </aside>
                {/* main */}
                <div className="p-4">
                  <h2 className="mb-0.5 text-sm font-semibold text-[#111827]">Your tracked areas</h2>
                  <p className="mb-3.5 text-[11.5px] text-[#9CA3AF]">Monitored weekly · digest every Monday</p>
                  <div className="rounded-xl border border-[#E5E7EB] bg-white p-3.5 shadow-sm">
                    <div className="mb-2.5 flex items-center justify-between">
                      <div>
                        <div className="text-[13px] font-semibold text-[#111827]">Croydon town centre</div>
                        <div className="mt-px text-[11px] text-[#9CA3AF]">CR0 1EA · croydon</div>
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
      <section className="border-t border-[#DCE7FF] bg-[#F5F8FF]">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-[#2563EB] mb-3 tracking-wider uppercase">
                Every Monday, 6am
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-[#111827] leading-tight mb-3.5 text-balance">
                The whole week, waiting in your inbox.
              </h2>
              <p className="text-[15.5px] text-[#6B7280] leading-relaxed mb-5 max-w-lg">
                No dashboards to check, no portals to trawl. One clean email per area — new applications, status changes and decisions, with the reference, address and description already pulled out.
              </p>
              <ul className="flex flex-col gap-2.5">
                {[
                  'Colour-coded statuses — approved, pending, refused at a glance',
                  'A preview of the top items, the rest one tap away',
                  'Straight to your dashboard from any application',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-sm text-[#111827]">
                    <span className="mt-px grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#ECFDF5] text-[#047857]">
                      <Check size={11} strokeWidth={3} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Email mockup */}
            <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,.04),0_12px_32px_-12px_rgba(16,24,40,.18)]">
              <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
                <span className="text-sm font-semibold tracking-tight text-[#111827]">
                  Planning<span className="text-[#2563EB]">Ping</span>
                </span>
                <span className="text-xs text-[#9CA3AF]">to you · notifications@planningping</span>
              </div>
              <div className="px-5 py-[18px]">
                <p className="text-[17px] font-bold tracking-tight text-[#111827]">5 new planning applications</p>
                <p className="mb-4 text-[12.5px] text-[#6B7280]">
                  Near <strong className="text-[#111827]">SW1A 0RS</strong> — new since your last digest
                </p>
                <div className="mb-2.5 rounded-[10px] border border-[#E5E7EB] p-3.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-[#2563EB]">26/04306/LBC</span>
                    <span className="text-[10px] text-[#9CA3AF]">30 Jun</span>
                    <span className="ml-auto"><Pill tone="warn">Pending</Pill></span>
                  </div>
                  <p className="mb-0.5 text-[12.5px] font-semibold text-[#111827]">16A Bedford Street, London WC2E 9HE</p>
                  <p className="text-xs leading-relaxed text-[#6B7280]">Replacement shopfront and associated works, including new fenestration, wall lights and a fixed canopy.</p>
                </div>
                <div className="mb-3 rounded-[10px] border border-[#E5E7EB] p-3.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-[#2563EB]">26/03998/FULL</span>
                    <span className="text-[10px] text-[#9CA3AF]">28 Jun</span>
                    <span className="ml-auto"><Pill tone="ok">Approved</Pill></span>
                  </div>
                  <p className="mb-0.5 text-[12.5px] font-semibold text-[#111827]">42 Marsham Street, London SW1P 3EU</p>
                  <p className="text-xs leading-relaxed text-[#6B7280]">Change of use of ground floor from office to retail with new shopfront.</p>
                </div>
                <span className="block rounded-lg bg-[#2563EB] py-2.5 text-center text-[13px] font-semibold text-white">
                  View on your dashboard →
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-[#E5E7EB]">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div>
              <div className="w-9 h-9 rounded-lg bg-[#EFF4FF] border border-[#DCE7FF] flex items-center justify-center mb-4 shadow-sm">
                <MapPin size={16} className="text-[#2563EB]" />
              </div>
              <h3 className="text-sm font-semibold text-[#111827] mb-2">Monitor any area</h3>
              <p className="text-sm text-[#6B7280] leading-relaxed">
                Add any UK postcode. We resolve the council automatically and start tracking every planning application in that area.
              </p>
            </div>
            <div>
              <div className="w-9 h-9 rounded-lg bg-[#EFF4FF] border border-[#DCE7FF] flex items-center justify-center mb-4 shadow-sm">
                <Mail size={16} className="text-[#2563EB]" />
              </div>
              <h3 className="text-sm font-semibold text-[#111827] mb-2">Weekly digests</h3>
              <p className="text-sm text-[#6B7280] leading-relaxed">
                Every Monday morning, get a clean email summary of what&apos;s new — application references, addresses, descriptions, and current status.
              </p>
            </div>
            <div>
              <div className="w-9 h-9 rounded-lg bg-[#EFF4FF] border border-[#DCE7FF] flex items-center justify-center mb-4 shadow-sm">
                <CheckCircle size={16} className="text-[#2563EB]" />
              </div>
              <h3 className="text-sm font-semibold text-[#111827] mb-2">Never miss a decision</h3>
              <p className="text-sm text-[#6B7280] leading-relaxed">
                Status changes and decisions are flagged the moment we detect them — approved, refused, or pending. No manual checking required.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-[#DCE7FF] bg-[#F5F8FF]">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-center text-xl font-semibold text-[#111827]">Pricing</h2>
          <p className="mt-1 text-center text-sm text-[#6B7280]">
            Free for homeowners. Built to pay for itself for professionals.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 max-w-3xl mx-auto">
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-[#111827]">Homeowner</h3>
              <p className="mt-2 text-2xl font-semibold text-[#111827]">Free</p>
              <p className="mt-1 text-xs text-[#9CA3AF]">forever</p>
              <ul className="mt-4 space-y-2 text-sm text-[#6B7280]">
                <li>Track planning applications near you</li>
                <li>Weekly email digest</li>
                <li>Status change alerts</li>
              </ul>
              <a
                href="/signup"
                className="mt-6 block rounded-md border border-[#2563EB] px-4 py-2 text-center text-sm font-medium text-[#2563EB] transition-colors hover:bg-blue-50"
              >
                Start free
              </a>
            </div>
            <div className="relative rounded-lg border-2 border-[#2563EB] bg-white p-6 shadow-sm">
              <span className="absolute -top-2.5 right-5 rounded-full bg-[#2563EB] px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">
                14-day trial
              </span>
              <h3 className="text-sm font-semibold text-[#111827]">Professional</h3>
              <p className="mt-2 text-2xl font-semibold text-[#111827]">£29<span className="text-sm font-normal text-[#6B7280]">/month</span></p>
              <p className="mt-1 text-xs text-[#9CA3AF]">or £290/year (2 months free) · 14-day free trial, no card required</p>
              <ul className="mt-4 space-y-2 text-sm text-[#6B7280]">
                <li>Everything in Homeowner</li>
                <li>Lead scoring across your councils</li>
                <li>Opportunity pipeline (CRM)</li>
                <li>AI outreach drafts</li>
              </ul>
              <a
                href="/signup?type=professional"
                className="mt-6 block rounded-md bg-[#2563EB] px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8]"
              >
                Start free trial
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E5E7EB]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#111827]">PlanningPing</span>
          <span className="text-xs text-[#9CA3AF]">Track planning. Stay ahead.</span>
        </div>
      </footer>
    </div>
  )
}
