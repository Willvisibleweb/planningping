'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function updatePassword(formData: FormData) {
  const password = formData.get('password')
  const confirmPassword = formData.get('confirm_password')

  if (typeof password !== 'string' || typeof confirmPassword !== 'string') {
    return { error: 'Enter your new password twice.' }
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' }
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'This reset link has expired. Request a new one.' }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return { error: 'Could not update your password. Request a new reset link and try again.' }
  }

  await supabase.auth.signOut()
  redirect('/login?password=updated')
}
