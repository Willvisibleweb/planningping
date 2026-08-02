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
    body: 'Every morning, we pull new and updated planning applications for every tracked territory from PlanIt, a national aggregator covering roughly 420 UK authorities.',
  },
  {
    title: 'Applications are scored',
    body: 'Each one is scored for likely civils subcontract scope — drainage, highways, flood risk, SuDS, groundworks/geotechnical and structural work — and banded HOT, WARM or COLD under Leads.',
  },
  {
    title: 'Track it as an opportunity',
    body: 'Add a promising application to your Pipeline. It moves through stages — Identified, Contacted, Negotiating, Won, Lost — exactly like a lightweight CRM.',
  },
  {
    title: 'Draft outreach, log contact',
    body: 'Generate a tailored outreach draft for any tracked opportunity, edit it, and mark it sent — that logs today as the contact date so you can see what still needs a follow-up.',
  },
]

export default function HowItWorksPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-[#202124] mb-1">How it works</h2>
        <p className="text-sm text-[#6B6C70]">
          Planning applications, turned into a working list of leads for your business
          development.
        </p>
      </div>

      <ol className="space-y-5">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#D6E4FB] bg-[#EAF0FF] text-xs font-semibold tabular-nums text-[#2563EB]">
              {i + 1}
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[#202124]">{step.title}</h3>
              <p className="mt-0.5 text-sm leading-relaxed text-[#6B6C70]">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-lg border border-[#D6E4FB] bg-white p-5">
        <h3 className="text-sm font-semibold text-[#202124]">Homeowner vs. professional</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-[#6B6C70]">
          Homeowner accounts get territory tracking and Leads (read-only) for free, forever.
          Professional accounts unlock Pipeline and AI outreach, with a 14-day free trial and
          no card required to start.
        </p>
      </div>
    </div>
  )
}
