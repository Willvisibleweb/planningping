// Creates a Stripe Checkout Session for the Pro subscription.
//
// Session-authenticated: only signed-in professional accounts can start
// checkout. The 14-day trial is app-side (profiles.trial_ends_at), so the
// subscription created here is a plain paid one — no Stripe trial config.
//
// The customer id is persisted via the admin client because migration 0006
// revoked user-scoped UPDATE on the stripe columns.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile, isProfessional } from '@/lib/access'
import { getStripe, priceIdFor, type PaidTier } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ error: 'Billing is not configured yet.' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile()
  if (!isProfessional(profile)) {
    return NextResponse.json(
      { error: 'Switch to a professional account in Settings first.' },
      { status: 403 },
    )
  }

  let body: { interval?: string; tier?: string }
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  if (body.tier !== 'mid' && body.tier !== 'top') {
    return NextResponse.json({ error: 'A plan tier is required.' }, { status: 400 })
  }
  const tier: PaidTier = body.tier
  const interval = body.interval === 'annual' ? 'annual' : 'monthly'
  const priceId = priceIdFor(tier, interval)
  if (!priceId) {
    return NextResponse.json({ error: 'Billing is not configured yet.' }, { status: 503 })
  }

  // Reuse the Stripe customer if we have one; create + persist otherwise.
  let customerId = profile!.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile!.email,
      metadata: { user_id: user.id },
    })
    customerId = customer.id
    const admin = createAdminClient()
    await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: user.id, // webhook fallback lookup
    line_items: [{ price: priceId, quantity: 1 }],
    // Set on both: session-level metadata is what checkout.session.completed
    // can read without an extra API call; subscription_data.metadata
    // propagates onto the Subscription object for later
    // customer.subscription.updated/deleted events. Neither back-fills the
    // other automatically.
    metadata: { tier },
    subscription_data: { metadata: { tier } },
    success_url: `${site}/settings?checkout=success`,
    cancel_url: `${site}/settings?checkout=cancelled`,
  })

  return NextResponse.json({ url: session.url })
}
