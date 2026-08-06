'use server'

import { createClient } from '@/lib/supabase/server'

export async function signup(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  // Whitelisted server-side AND in the DB trigger — anything unexpected
  // becomes 'homeowner'. Professionals get a 14-day trial via the trigger.
  const userType = formData.get('user_type') === 'professional' ? 'professional' : 'homeowner'

  // Partner segmentation. Whitelisted the same way, and only honoured for
  // professional accounts — GabrielCAM's customers are construction firms, so
  // a homeowner claiming the partnership is a mis-click at best.
  //
  // This is a self-declaration that unlocks UI, not entitlement: it grants no
  // paid features and no access to anyone else's data. It still travels the
  // trusted path (user_meta_data → the SECURITY DEFINER trigger, which
  // re-whitelists it) rather than being writable from the browser.
  const partnershipProvider =
    userType === 'professional' && formData.get('partnership_provider') === 'gabrielcam'
      ? 'gabrielcam'
      : null

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
      // Lands in auth.users.raw_user_meta_data; the handle_new_user trigger
      // reads it to set profiles.user_type and start the trial clock.
      data: { user_type: userType, partnership_provider: partnershipProvider },
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
