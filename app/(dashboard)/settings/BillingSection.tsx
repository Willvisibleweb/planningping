'use client'

// Billing — upgrade to Mid or Top (monthly/annual) or manage an existing
// subscription. Mounted with id="billing" so trial banners and ProGate CTAs
// can deep-link here. Professional accounts only (the parent server
// component decides whether to render).

import { useState, useTransition } from 'react'
import { PRICING, type PaidTier, type Interval } from '@/lib/stripe'
import type { Profile } from '@/types/database'

const TIER_COPY: Record<PaidTier, { name: string; radius: string; areas: string }> = {
  mid: { name: 'Mid', radius: `${PRICING.mid.radiusKm}km radius`, areas: `${PRICING.mid.maxAreas} tracked areas` },
  top: { name: 'Top', radius: `${PRICING.top.radiusKm}km radius`, areas: 'Unlimited tracked areas' },
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

  const subscribed = profile.subscription_status === 'active'

  function upgrade(tier: PaidTier) {
    setError(null)
    startTransition(async () => {
      setError(await redirectTo('/api/stripe/checkout', { tier, interval }))
    })
  }

  function managePlan() {
    setError(null)
    startTransition(async () => {
      setError(await redirectTo('/api/stripe/portal'))
    })
  }

  return (
    <div id="billing" className="rounded-lg border border-[#D6E4FB] bg-white p-5">
      <h3 className="text-sm font-semibold text-[#202124]">Billing</h3>

      {subscribed ? (
        <>
          <p className="mt-1 text-sm text-[#6B6C70]">
            You&rsquo;re on the {profile.pro_tier ? TIER_COPY[profile.pro_tier].name : 'professional'}{' '}
            plan. Manage or cancel your subscription any time.
          </p>
          <button
            onClick={managePlan}
            disabled={isPending}
            className="mt-3 rounded-md border border-[#D6E4FB] px-3 py-1.5 text-sm font-medium text-[#202124] transition-colors hover:bg-[#F7F7F8] disabled:opacity-50"
          >
            {isPending ? 'Opening…' : 'Manage subscription'}
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-[#6B6C70]">
            Upgrade to keep the pipeline, opportunity tracking and AI outreach after your trial.
          </p>

          <div className="mt-3 inline-flex rounded-md border border-[#D6E4FB] p-0.5 text-xs">
            {(['monthly', 'annual'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setInterval(opt)}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                  interval === opt ? 'bg-[#2563EB] text-white' : 'text-[#6B6C70] hover:text-[#202124]'
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
                <div key={tier} className="rounded-md border border-[#D6E4FB] p-3">
                  <p className="text-sm font-semibold text-[#202124]">{TIER_COPY[tier].name}</p>
                  <p className="mt-1 text-lg font-semibold text-[#202124]">{price.label}</p>
                  {'note' in price && <p className="text-[11px] text-[#A0A1A6]">{price.note}</p>}
                  <ul className="mt-2 space-y-0.5 text-xs text-[#6B6C70]">
                    <li>{TIER_COPY[tier].radius}</li>
                    <li>{TIER_COPY[tier].areas}</li>
                    <li>{PRICING[tier].support}</li>
                  </ul>
                  <button
                    onClick={() => upgrade(tier)}
                    disabled={isPending}
                    className="mt-3 w-full rounded-md bg-[#2563EB] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50"
                  >
                    {isPending ? 'Opening…' : `Upgrade to ${TIER_COPY[tier].name}`}
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
