import { PRICING } from '@/lib/stripe'
// How it works — a plain explainer of the real pipeline: what happens between
// adding a postcode and generating outreach. No invented steps; every claim
// here maps to an actual part of the system (ingest cron, scoring engine,
// pipeline actions, outreach route).

const STEPS = [
  {
    title: 'Add a territory',
    body: 'Enter a postcode and a radius. We identify the planning authority automatically — no need to know which council covers an area.',
  },
  {
    title: 'We check daily',
    body: 'Every morning we pull new and updated applications for every tracked territory from PlanIt, a national aggregator covering roughly 420 UK authorities — so you see a scheme while there is still time to act on it.',
  },
  {
    title: 'Everything is scored for fit',
    body: 'Each scheme is scored for the scope your firm is likely to win — drainage, highways, flood risk, SuDS, groundworks, geotechnical and structural work — and sorted into Strong match, Worth reviewing or Low priority under Opportunities. Every score shows its working, so you can qualify it rather than take our word for it.',
  },
  {
    title: 'Work it through your pipeline',
    body: 'Add anything promising to your Pipeline and move it through your own stages. New accounts start with New, Qualified, Contacted, In conversation, Won and Lost — rename them, reorder them or add your own in Settings to match how your team actually sells.',
  },
  {
    title: 'Draft outreach, log contact',
    body: 'Generate a tailored outreach draft for any tracked opportunity, edit it, and mark it sent — that logs today as the contact date so you can see what still needs a follow-up.',
  },
]

export default function HowItWorksPage() {
  return (
    <div className="pp-stagger max-w-2xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-ink mb-1">How it works</h2>
        <p className="text-sm text-ink-muted">
          How development activity becomes a working sales pipeline — every step
          below is something the system actually does.
        </p>
      </div>

      <ol className="space-y-5">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-primary-100 text-xs font-semibold tabular-nums text-primary-500">
              {i + 1}
            </span>
            <div>
              <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-md border border-border bg-surface p-5 sm:p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-ink">Free and paid</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          The free tier covers one territory at a {PRICING.free.radiusKm}km radius, with
          scored opportunities you can read. Paid plans widen the radius, add
          more territories, and unlock the Pipeline and outreach drafting — with
          a {PRICING.trialDays}-day trial and no card required to start.
        </p>
      </div>
    </div>
  )
}
