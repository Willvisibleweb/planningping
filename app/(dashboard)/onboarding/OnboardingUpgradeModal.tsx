'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Sparkles, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Alert } from '@/components/ui/ErrorState'
import { cn } from '@/lib/cn'

type Interval = 'monthly' | 'annual'
type Tier = 'mid' | 'top'

interface PlanCopy {
  tier: Tier
  name: string
  monthly: string
  annual: string
  annualNote?: string
  radius: string
  areas: string
  support: string
  badge?: string
  highlights: string[]
}

const PLANS: PlanCopy[] = [
  {
    tier: 'mid',
    name: 'Pro',
    monthly: '£29/month',
    annual: '£290/year',
    annualNote: '2 months free',
    radius: '3km search radius',
    areas: '3 tracked areas',
    support: 'Standard support',
    badge: 'Best start',
    highlights: ['Keep your customised opportunity profile active', 'Track leads through pipeline and outreach', 'Receive alerts for projects that match your work'],
  },
  {
    tier: 'top',
    name: 'Max',
    monthly: '£59/month',
    annual: '£590/year',
    annualNote: '2 months free',
    radius: '5km search radius',
    areas: 'Unlimited tracked areas',
    support: 'Priority support',
    badge: 'Most powerful',
    highlights: ['Everything in Pro', 'AI summaries and PlanPal assistant', 'Wider coverage for teams selling across multiple patches'],
  },
]

async function redirectToCheckout(tier: Tier, interval: Interval): Promise<string | null> {
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier, interval }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return data.error ?? 'Could not open checkout. Please try again.'
  if (data.url) {
    window.location.href = data.url
    return null
  }
  return 'Could not open checkout. Please try again.'
}

export default function OnboardingUpgradeModal({ show }: { show: boolean }) {
  const [open, setOpen] = useState(show)
  const [interval, setInterval] = useState<Interval>('annual')
  const [error, setError] = useState<string | null>(null)
  const [activeTier, setActiveTier] = useState<Tier | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const close = useCallback(() => {
    setOpen(false)
    router.replace('/onboarding', { scroll: false })
  }, [router])

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [close, open])

  function subscribe(tier: Tier) {
    setError(null)
    setActiveTier(tier)
    startTransition(async () => {
      setError(await redirectToCheckout(tier, interval))
      setActiveTier(null)
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/35 px-4 py-6 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signup-upgrade-title"
        className="relative max-h-[calc(100vh-3rem)] w-full max-w-3xl overflow-y-auto rounded-md border border-border bg-surface p-5 shadow-xl sm:p-6"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-sm text-ink-muted transition-colors duration-fast ease-standard hover:bg-neutral-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45"
        >
          <X size={16} aria-hidden="true" />
        </button>

        <div className="pr-8">
          <div className="mb-3 inline-flex size-10 items-center justify-center rounded-full bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-200">
            <Sparkles size={18} aria-hidden="true" />
          </div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-primary-700">Your trial is ready</p>
          <h2 id="signup-upgrade-title" className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            Keep your customised profile working for you
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            PlanningPing is about to tune opportunities around your trade, patch and timing. Subscribe to Pro or Max to keep that profile powering alerts, pipeline tracking and sales outreach after your trial.
          </p>
        </div>

        <div className="mt-5 inline-flex rounded-sm border border-border p-0.5 text-xs">
          {(['annual', 'monthly'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setInterval(opt)}
              aria-pressed={interval === opt}
              className={cn(
                'rounded-sm px-3 py-1.5 font-medium transition-[background-color,color,box-shadow] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-1',
                interval === opt ? 'bg-primary-500 text-white shadow-sm' : 'text-ink-muted hover:bg-primary-50 hover:text-ink',
              )}
            >
              {opt === 'annual' ? 'Annual' : 'Monthly'}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <div key={plan.tier} className="rounded-sm border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-ink">{plan.name}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                    {interval === 'annual' ? plan.annual : plan.monthly}
                  </p>
                  {interval === 'annual' && plan.annualNote && (
                    <p className="text-2xs font-medium text-success-600">{plan.annualNote}</p>
                  )}
                </div>
                {plan.badge && (
                  <span className="rounded-full bg-primary-50 px-2 py-1 text-2xs font-semibold text-primary-700 ring-1 ring-inset ring-primary-200">
                    {plan.badge}
                  </span>
                )}
              </div>

              <ul className="mt-4 space-y-2 text-xs leading-relaxed text-ink-muted">
                {[plan.radius, plan.areas, plan.support, ...plan.highlights].map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check size={13} className="mt-0.5 shrink-0 text-primary-500" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <Button
                size="sm"
                fullWidth
                className="mt-5"
                onClick={() => subscribe(plan.tier)}
                loading={isPending && activeTier === plan.tier}
                loadingLabel={`Opening checkout for ${plan.name}`}
              >
                Subscribe to {plan.name}
                <ArrowRight size={14} aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>

        {error && (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={close}
            className="rounded-sm px-3 py-2 text-xs font-medium text-ink-muted transition-colors duration-fast ease-standard hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45"
          >
            Continue setup first
          </button>
          <p className="text-xs leading-relaxed text-ink-muted">
            You can also choose a plan later from Settings.
          </p>
        </div>
      </div>
    </div>
  )
}
