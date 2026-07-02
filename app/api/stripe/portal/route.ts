// Stripe customer portal — lets a subscribed user manage/cancel their plan.
// Session-authenticated; requires an existing Stripe customer. (Enable the
// customer portal once in the Stripe dashboard: Settings → Billing → Portal.)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/access'
import { getStripe } from '@/lib/stripe'

export async function POST() {
  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ error: 'Billing is not configured yet.' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile()
  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account found.' }, { status: 400 })
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/settings`,
  })

  return NextResponse.json({ url: session.url })
}
