'use server'

import { createClient } from '@/lib/supabase/server'

export async function sendResetEmail(formData: FormData) {
  const email = formData.get('email') as string

  if (!email) {
    return { error: 'Email is required.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/update-password`,
  })

  // Always return success even if the email isn't registered — prevents
  // account enumeration attacks (attackers probing which emails exist).
  if (error) {
    console.error('Password reset error:', error.message)
  }

  return {}
}
