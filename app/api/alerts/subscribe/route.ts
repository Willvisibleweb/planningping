// Public email capture for the location pages. Writes to location_subscriptions
// via the service-role admin client (the table has RLS on with no public
// policies, so this route is the only writer).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TYPES = new Set(['council', 'postcode', 'town'])

export async function POST(request: NextRequest) {
  let body: { email?: unknown; location_slug?: unknown; location_type?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const locationSlug = typeof body.location_slug === 'string' ? body.location_slug : ''
  const locationType = typeof body.location_type === 'string' ? body.location_type : ''

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }
  if (!locationSlug || !/^[a-z0-9-]+$/.test(locationSlug) || !TYPES.has(locationType)) {
    return NextResponse.json({ error: 'Invalid location.' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from('location_subscriptions').insert({
    email,
    location_slug: locationSlug,
    location_type: locationType,
  })

  // 23505 = unique violation → already subscribed; treat as success (idempotent).
  if (error && error.code !== '23505') {
    console.error('Alert subscribe failed:', error.message)
    return NextResponse.json({ error: 'Could not save your subscription. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
