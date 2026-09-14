// Stripe client + pricing config. Server-side only.
//
// Env vars (all from the guardian-owned Stripe account; use test-mode keys
// until launch):
//   STRIPE_SECRET_KEY            — sk_test_… / sk_live_…
//   STRIPE_WEBHOOK_SECRET        — whsec_… (per endpoint; `stripe listen` prints one locally)
//   STRIPE_PRICE_ID_MID_MONTHLY  — price_… for Pro Monthly £49
//   STRIPE_PRICE_ID_MID_ANNUAL   — price_… for Pro Annual £490
//   STRIPE_PRICE_ID_TOP_MONTHLY  — price_… for Max Monthly £99
//   STRIPE_PRICE_ID_TOP_ANNUAL   — price_… for Max Annual £990
//
// These IDs are what customers are actually charged. PRICING below is only what
// they are shown. Changing one without the other means advertising one figure
// and billing another, so the two move together or not at all.
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

export type PaidTier = 'mid' | 'top'
export type Interval = 'monthly' | 'annual'

const PRICE_IDS: Record<PaidTier, Record<Interval, string | undefined>> = {
  mid: { monthly: process.env.STRIPE_PRICE_ID_MID_MONTHLY, annual: process.env.STRIPE_PRICE_ID_MID_ANNUAL },
  top: { monthly: process.env.STRIPE_PRICE_ID_TOP_MONTHLY, annual: process.env.STRIPE_PRICE_ID_TOP_ANNUAL },
}

export function priceIdFor(tier: PaidTier, interval: Interval): string | undefined {
  return PRICE_IDS[tier][interval]
}

// Reverse lookup — used by the webhook to resolve tier from a subscription's
// actual price id, rather than trusting metadata that can go stale if a plan
// is ever changed via the Stripe Customer Portal (which updates price, not
// metadata) instead of a fresh checkout.
export function tierForPriceId(priceId: string): PaidTier | undefined {
  for (const tier of Object.keys(PRICE_IDS) as PaidTier[]) {
    if (PRICE_IDS[tier].monthly === priceId || PRICE_IDS[tier].annual === priceId) return tier
  }
  return undefined
}

// Single source of truth for DISPLAYED pricing — landing page, signup cards and
// the billing section all read from here. It does not control what anyone is
// charged: that comes from the Stripe price IDs above. Editing these numbers
// alone changes the shop window and not the till. maxAreas is null for
// "unlimited" (never the literal Infinity — keep it JSON/UI-safe); format at
// the UI layer, don't render the raw value.
export const PRICING = {
  free: { radiusKm: 1, maxAreas: 1 },
  mid: {
    monthly: { label: '£49/month', amount: 49 },
    annual: { label: '£490/year', amount: 490, note: '2 months free' },
    radiusKm: 3,
    maxAreas: 3,
    support: 'Standard support',
  },
  top: {
    monthly: { label: '£99/month', amount: 99 },
    annual: { label: '£990/year', amount: 990, note: '2 months free' },
    radiusKm: 5,
    maxAreas: null,
    support: 'Priority support',
  },
  trialDays: 14,
} as const
