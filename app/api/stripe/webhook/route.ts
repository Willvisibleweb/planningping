// Stripe webhook — the single writer of subscription state onto profiles.
//
// Security: NO session here; authenticity comes from the Stripe signature over
// the RAW request body (request.text() — never parse JSON first). Writes use
// the service-role admin client: RLS and the column-level grants from
// migration 0006 would block anything else.
//
// Handlers are idempotent column-sets, so Stripe's retries are harmless.
// Events to enable on the endpoint (or forwarded by `stripe listen`):
//   checkout.session.completed
//   customer.subscription.updated
//   customer.subscription.deleted

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, tierForPriceId, type PaidTier } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  const stripe = getStripe()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: 'Billing is not configured.' }, { status: 503 })
  }

  const body = await request.text()
  const signature = request.headers.get('stripe-signature')
  if (!signature) return new NextResponse('Missing signature', { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch {
    return new NextResponse('Invalid signature', { status: 400 })
  }

  const admin = createAdminClient()

  switch (event.type) {
    // First successful payment — flip the account to Pro.
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode !== 'subscription' || !session.client_reference_id) break
      // Fresh from checkout, so session metadata is reliable here (unlike in
      // the subscription events below, which prefer the price id instead).
      const tier = session.metadata?.tier as PaidTier | undefined
      await admin
        .from('profiles')
        .update({
          plan: 'pro',
          subscription_status: 'active',
          stripe_customer_id: (session.customer as string) ?? null,
          stripe_subscription_id: (session.subscription as string) ?? null,
          ...(tier === 'mid' || tier === 'top' ? { pro_tier: tier } : {}),
        })
        .eq('id', session.client_reference_id)
      break
    }

    // Renewals, payment failures, cancellations — keep status in sync.
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const active = sub.status === 'active' || sub.status === 'trialing'
      // Resolve tier from the subscription's actual current price, not
      // stored metadata — metadata is only ever set at checkout time and
      // goes stale if the plan is later changed via the Stripe Customer
      // Portal (which updates price, not metadata). Only overwrite pro_tier
      // when a tier actually resolves — don't null out a known-good value
      // on an unrecognized price id.
      const priceId = sub.items.data[0]?.price?.id
      const resolvedTier = (priceId && tierForPriceId(priceId)) || (sub.metadata?.tier as PaidTier | undefined)
      await admin
        .from('profiles')
        .update({
          subscription_status: sub.status,
          plan: active ? 'pro' : 'free',
          ...(resolvedTier === 'mid' || resolvedTier === 'top' ? { pro_tier: resolvedTier } : {}),
        })
        .eq('stripe_customer_id', sub.customer as string)
      break
    }
  }

  return NextResponse.json({ received: true })
}
