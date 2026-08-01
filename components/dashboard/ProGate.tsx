// Full-page gate shown in place of a professional feature.
// Presentational only — the page rendering this must have already done the
// server-side hasProAccess() check. Two variants:
//   homeowner — the user signed up as a homeowner and this feature isn't for them
//   expired   — a professional whose trial ended without a subscription

const COPY = {
  homeowner: {
    heading: 'This is a professional feature',
    body: 'The pipeline, opportunity tracking and AI outreach are built for civil engineering firms doing business development — pursuing planning applications as opportunities across drainage, highways, flood risk, SuDS, groundworks/geotechnical and structural scope. Your account is set up as a homeowner — you can switch to a professional account (with a 14-day free trial) in Settings.',
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
    <div className="flex flex-col items-center justify-center rounded-lg border border-[#D6E4FB] bg-white px-6 py-16 text-center">
      <h2 className="text-lg font-semibold text-[#202124]">{copy.heading}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[#6B6C70]">{copy.body}</p>
      <a
        href={copy.href}
        className="mt-6 inline-block rounded-md bg-[#2563EB] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8]"
      >
        {copy.cta}
      </a>
    </div>
  )
}
