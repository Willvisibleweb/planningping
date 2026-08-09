'use server'

// Server Actions for login. Running server-side means:
// - Credentials are never logged in the browser or accessible to JS.
// - The Supabase call happens on the server, not the client.
// - Redirects after login are safe from client-side manipulation.
//
// Rate limiting also has to live here rather than in the client: a limit the
// browser enforces is no limit at all, since anyone can call the endpoint
// directly. See lib/auth/rateLimit.ts for the thresholds and why Supabase's
// own limit isn't enough on its own.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, recordAttempt } from '@/lib/auth/rateLimit'

export async function loginWithPassword(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const limit = await checkRateLimit(email)
  if (!limit.allowed) {
    return { error: limit.message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  await recordAttempt(email, !error)

  if (error) {
    // Return a generic message — don't reveal whether the email exists.
    return { error: 'Invalid email or password.' }
  }

  redirect('/dashboard')
}

export async function loginWithMagicLink(formData: FormData) {
  const email = formData.get('email') as string

  if (!email) {
    return { error: 'Email is required.' }
  }

  // Rate limited too, for a different reason: without it this is a button that
  // sends mail to any address on demand, which is an email-bombing tool with
  // someone else's domain on it. Supabase caps this per user at one every 60
  // seconds; the shared limiter also caps it per IP across many addresses.
  const limit = await checkRateLimit(email)
  if (!limit.allowed) {
    return { error: limit.message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // After clicking the link, Supabase redirects here to exchange the token.
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  })

  // A magic-link request is only "successful" in the sense that mail was sent;
  // it isn't an authentication, so it never clears the failure count.
  await recordAttempt(email, false)

  if (error) {
    return { error: 'Could not send magic link. Please try again.' }
  }

  // No redirect — the client shows a "check your email" message.
  return {}
}
