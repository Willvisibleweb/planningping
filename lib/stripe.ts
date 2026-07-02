// Stripe client + pricing config. Server-side only.
//
// Env vars (all from the guardian-owned Stripe account; use test-mode keys
// until launch):
//   STRIPE_SECRET_KEY        — sk_test_… / sk_live_…
//   STRIPE_WEBHOOK_SECRET    — whsec_… (per endpoint; `stripe listen` prints one locally)
//   STRIPE_PRICE_ID_MONTHLY  — price_… for Pro Monthly £29
//   STRIPE_PRICE_ID_ANNUAL   — price_… for Pro Annual £290
//
// Everything degrades gracefully when unconfigured: routes return 503 rather
// than crashing, so the app deploys fine before the Stripe account exists.

import Stripe from 'stripe'

let client: Stripe | null = null

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY)
  return client
}

export function priceIdFor(interval: 'monthly' | 'annual'): string | undefined {
  return interval === 'annual'
    ? process.env.STRIPE_PRICE_ID_ANNUAL
    : process.env.STRIPE_PRICE_ID_MONTHLY
}

// Single source of truth for displayed pricing — landing page, signup cards
// and the billing section all read from here.
export const PRICING = {
  monthly: { label: '£29/month', amount: 29 },
  annual: { label: '£290/year', amount: 290, note: '2 months free' },
  trialDays: 14,
} as const
