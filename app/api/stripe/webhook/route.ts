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
import { getStripe } from '@/lib/stripe'

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
      await admin
        .from('profiles')
        .update({
          plan: 'pro',
          subscription_status: 'active',
          stripe_customer_id: (session.customer as string) ?? null,
          stripe_subscription_id: (session.subscription as string) ?? null,
        })
        .eq('id', session.client_reference_id)
      break
    }

    // Renewals, payment failures, cancellations — keep status in sync.
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const active = sub.status === 'active' || sub.status === 'trialing'
      await admin
        .from('profiles')
        .update({
          subscription_status: sub.status,
          plan: active ? 'pro' : 'free',
        })
        .eq('stripe_customer_id', sub.customer as string)
      break
    }
  }

  return NextResponse.json({ received: true })
}
