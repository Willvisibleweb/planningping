'use server'

import { createClient } from '@/lib/supabase/server'

export async function signup(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // After email confirmation, Supabase redirects to this URL.
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  })

  if (error) {
    // Don't reveal whether an email address is already registered.
    return { error: 'Could not create account. Please try again.' }
  }

  // Return success — the client shows a "check your email" message.
  // We don't redirect here because the user needs to confirm their email first.
  return {}
}
