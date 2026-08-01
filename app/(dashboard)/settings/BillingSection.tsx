'use client'

// Billing — upgrade to Pro (monthly/annual) or manage an existing subscription.
// Mounted with id="billing" so trial banners and ProGate CTAs can deep-link here.
// Professional accounts only (the parent server component decides whether to render).

import { useState, useTransition } from 'react'
import type { Profile } from '@/types/database'

const PRICING_DISPLAY = {
  monthly: '£29/month',
  annual: '£290/year (2 months free)',
} as const

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
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const subscribed = profile.subscription_status === 'active'

  function upgrade(interval: 'monthly' | 'annual') {
    setError(null)
    startTransition(async () => {
      setError(await redirectTo('/api/stripe/checkout', { interval }))
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
            You&rsquo;re on the professional plan. Manage or cancel your subscription any time.
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
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => upgrade('monthly')}
              disabled={isPending}
              className="rounded-md bg-[#2563EB] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50"
            >
              {isPending ? 'Opening…' : `Upgrade — ${PRICING_DISPLAY.monthly}`}
            </button>
            <button
              onClick={() => upgrade('annual')}
              disabled={isPending}
              className="rounded-md border border-[#2563EB] px-3 py-1.5 text-sm font-medium text-[#2563EB] transition-colors hover:bg-blue-50 disabled:opacity-50"
            >
              {isPending ? 'Opening…' : PRICING_DISPLAY.annual}
            </button>
          </div>
        </>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
