'use client'

// Billing — upgrade to Pro or Max (monthly/annual) or manage an existing
// subscription. Mounted with id="billing" so trial banners and ProGate CTAs
// can deep-link here. Professional accounts only (the parent server
// component decides whether to render).

import { useState, useTransition } from 'react'
import { PRICING, type PaidTier, type Interval } from '@/lib/stripe'
import Button from '@/components/ui/Button'
import { Alert } from '@/components/ui/ErrorState'
import type { Profile } from '@/types/database'

// Display names only — 'mid'/'top' stay as the internal tier identifiers
// throughout the codebase (DB column, types, env vars); only what the
// customer actually sees changes here, to match the Stripe product names.
const TIER_COPY: Record<PaidTier, { name: string; radius: string; areas: string }> = {
  mid: { name: 'Pro', radius: `${PRICING.mid.radiusKm}km radius`, areas: `${PRICING.mid.maxAreas} tracked areas` },
  top: { name: 'Max', radius: `${PRICING.top.radiusKm}km radius`, areas: 'Unlimited tracked areas' },
}

async function redirectTo(path: string, body?: object): Promise<string | null> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return data.error ?? 'Something went wrong. Please try again.'
  if (data.url) {
    window.location.href = data.url
    return null
  }
  return 'Something went wrong. Please try again.'
}

export default function BillingSection({ profile }: { profile: Profile }) {
  const [interval, setInterval] = useState<Interval>('monthly')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // Which control the user actually clicked. isPending alone is shared across
  // every button in this section, so without this both upgrade buttons showed
  // a pending state when you clicked either one — it looked like the app was
  // charging you for both plans. Presentation state only; the Stripe calls
  // below are untouched.
  const [activeAction, setActiveAction] = useState<PaidTier | 'portal' | null>(null)

  const subscribed = profile.subscription_status === 'active'

  function upgrade(tier: PaidTier) {
    setError(null)
    setActiveAction(tier)
    startTransition(async () => {
      setError(await redirectTo('/api/stripe/checkout', { tier, interval }))
      setActiveAction(null)
    })
  }

  function managePlan() {
    setError(null)
    setActiveAction('portal')
    startTransition(async () => {
      setError(await redirectTo('/api/stripe/portal'))
      setActiveAction(null)
    })
  }

  return (
    <div id="billing" className="rounded-md border border-border bg-surface p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-ink">Billing</h3>

      {subscribed ? (
        <>
          <p className="mt-1 text-sm text-ink-muted">
            You&rsquo;re on the {profile.pro_tier ? TIER_COPY[profile.pro_tier].name : 'professional'}{' '}
            plan. Manage or cancel your subscription any time.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={managePlan}
            loading={isPending && activeAction === 'portal'}
            loadingLabel="Opening billing portal"
          >
            Manage subscription
          </Button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-muted">
            Upgrade to keep the pipeline, opportunity tracking and AI outreach after your trial.
          </p>

          <div className="mt-4 inline-flex rounded-sm border border-border p-0.5 text-xs">
            {(['monthly', 'annual'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setInterval(opt)}
                aria-pressed={interval === opt}
                className={`rounded-sm px-2.5 py-1 font-medium transition-[background-color,color,box-shadow] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-1 ${
                  interval === opt
                    ? 'bg-primary-500 text-white shadow-sm'
                    : 'text-ink-muted hover:bg-primary-50 hover:text-ink'
                }`}
              >
                {opt === 'monthly' ? 'Monthly' : 'Annual'}
              </button>
            ))}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(['mid', 'top'] as const).map((tier) => {
              const price = PRICING[tier][interval]
              return (
                <div key={tier} className="rounded-sm border border-border p-4">
                  <p className="text-sm font-semibold text-ink">{TIER_COPY[tier].name}</p>
                  <p className="mt-1 text-lg font-semibold text-ink">{price.label}</p>
                  {'note' in price && <p className="text-2xs text-ink-muted">{price.note}</p>}
                  <ul className="mt-2.5 space-y-1 text-xs text-ink-muted">
                    <li>{TIER_COPY[tier].radius}</li>
                    <li>{TIER_COPY[tier].areas}</li>
                    <li>{PRICING[tier].support}</li>
                  </ul>
                  <Button
                    size="sm"
                    fullWidth
                    className="mt-4"
                    onClick={() => upgrade(tier)}
                    loading={isPending && activeAction === tier}
                    loadingLabel={`Opening checkout for ${TIER_COPY[tier].name}`}
                  >
                    Upgrade to {TIER_COPY[tier].name}
                  </Button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}
    </div>
  )
}
