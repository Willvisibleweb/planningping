'use server'

// Server Actions for login. Running server-side means:
// - Credentials are never logged in the browser or accessible to JS.
// - The Supabase call happens on the server, not the client.
// - Redirects after login are safe from client-side manipulation.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function loginWithPassword(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

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

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // After clicking the link, Supabase redirects here to exchange the token.
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  })

  if (error) {
    return { error: 'Could not send magic link. Please try again.' }
  }

  // No redirect — the client shows a "check your email" message.
  return {}
}
