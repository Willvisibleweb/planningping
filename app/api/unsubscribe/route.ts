// One-click unsubscribe endpoint, named in every customer email's
// List-Unsubscribe header (see lib/email/unsubscribe.ts).
//
// POST is what Gmail, Yahoo and Apple Mail send when the reader presses their
// built-in "Unsubscribe" button (RFC 8058). It must act immediately with no
// further confirmation, and it arrives with no cookies, so the signed u/t pair
// in the URL is the only proof of who is asking.
//
// GET is for older clients that open the header URL in a browser instead. It
// deliberately does NOT unsubscribe — link scanners prefetch GETs — and sends
// the reader to the confirm page instead.

import { NextRequest, NextResponse } from 'next/server'
import { verifyUnsubscribe } from '@/lib/email/unsubscribe'
import { setEmailsUnsubscribed } from '@/lib/email/subscription'

export async function POST(request: NextRequest) {
  const u = request.nextUrl.searchParams.get('u') ?? ''
  const t = request.nextUrl.searchParams.get('t') ?? ''

  if (!verifyUnsubscribe(u, t)) {
    return NextResponse.json({ error: 'Invalid unsubscribe link.' }, { status: 400 })
  }

  const ok = await setEmailsUnsubscribed(u, true)
  if (!ok) {
    return NextResponse.json({ error: 'Could not unsubscribe. Please try again.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone()
  url.pathname = '/unsubscribe'
  return NextResponse.redirect(url, 303)
}
