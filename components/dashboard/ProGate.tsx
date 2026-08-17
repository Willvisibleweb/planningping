// Full-page gate shown in place of a professional feature.
// Presentational only — the page rendering this must have already done the
// server-side hasProAccess() check. Two variants:
//   homeowner — the user signed up as a homeowner and this feature isn't for them
//   expired   — a professional whose trial ended without a subscription

import { PRICING } from '@/lib/stripe'

const COPY = {
  homeowner: {
    heading: 'This is a professional feature',
    body: `The pipeline, opportunity tracking and outreach drafting are built for construction firms doing business development — drainage, highways, flood risk, SuDS, groundworks, geotechnical and structural scope. Your account is set up as a homeowner, which predates that: switch it to a professional account in Settings and the ${PRICING.trialDays}-day trial starts then, no card required.`,
    cta: 'View account settings',
    href: '/settings',
  },
  expired: {
    heading: 'Your free trial has ended',
    body: 'Your pipeline and tracked leads are saved exactly as you left them. Upgrade to pick up where you left off.',
    cta: 'Upgrade',
    href: '/settings#billing',
  },
} as const

export default function ProGate({ variant }: { variant: keyof typeof COPY }) {
  const copy = COPY[variant]

  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-border bg-surface px-6 py-16 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-ink">{copy.heading}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-muted">{copy.body}</p>
      <a
        href={copy.href}
        className="mt-6 inline-block rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600"
      >
        {copy.cta}
      </a>
    </div>
  )
}
