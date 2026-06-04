// Auth callback route — this is where Supabase redirects after:
//   - Email confirmation (after signup)
//   - Magic link clicks
//   - Password reset links
//
// Supabase appends a ?code= parameter. We exchange it for a session here,
// then redirect the user into the app. Without this route, none of the
// email-based auth flows would complete — the user would click the link
// and land on a page that does nothing.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // 'next' lets us redirect to a specific page after auth (e.g. /update-password)
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // If something went wrong, send the user back to login with an error flag
  // rather than leaving them on a broken page.
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
