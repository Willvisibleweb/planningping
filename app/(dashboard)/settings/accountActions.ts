'use server'

// Email preference and account deletion — the two settings actions that act on
// the whole account rather than one feature.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMfaState } from '@/lib/auth/mfa'
import { getStripe } from '@/lib/stripe'
import { setEmailsUnsubscribed } from '@/lib/email/subscription'

export async function setEmailsEnabled(enabled: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const ok = await setEmailsUnsubscribed(user.id, !enabled)
  if (!ok) return { error: 'Could not save your email preference.' }

  revalidatePath('/settings')
  return {}
}

// Subscription states in which Stripe will still charge the card. A cancelled
// or incomplete_expired subscription needs no action.
const LIVE_SUBSCRIPTION = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'])

/**
 * Permanently deletes the signed-in user's account.
 *
 * Order matters, and each step stops the whole thing if it fails:
 *   1. Cancel any live Stripe subscription. Done first because deleting the
 *      account also deletes the only record linking the person to their
 *      subscription — get this wrong and they keep being charged for an
 *      account that no longer exists.
 *   2. Remove their letterhead logo from storage. Storage objects are not
 *      covered by the database cascade.
 *   3. Delete the auth user. Every table holding their data references
 *      profiles or auth.users with ON DELETE CASCADE (checked against the live
 *      database on 24 Sep 2026), so this one call removes the lot. The only
 *      exception is coverage_requests, which is ON DELETE SET NULL — the
 *      postcode stays as anonymous demand data with nothing tying it to them.
 *
 * The Stripe customer record itself is kept: payment records must be held for
 * six years for tax, as the privacy policy says.
 */
export async function deleteAccount(confirmEmail: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  // Server actions don't pass through the dashboard layout, so its 2FA gate
  // doesn't cover them. Without this, a half-signed-in session (password
  // entered, code not) could delete the account.
  const mfa = await getMfaState()
  if (mfa.challengeRequired) return { error: 'Complete two-factor sign-in first.' }

  if (confirmEmail.trim().toLowerCase() !== (user.email ?? '').toLowerCase()) {
    return { error: 'That email doesn’t match your account.' }
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_subscription_id, subscription_status')
    .eq('id', user.id)
    .single()

  // 1. Stop billing.
  const subId = profile?.stripe_subscription_id as string | null | undefined
  const status = profile?.subscription_status as string | null | undefined
  if (subId && status && LIVE_SUBSCRIPTION.has(status)) {
    const stripe = getStripe()
    if (!stripe) {
      return { error: 'We couldn’t cancel your subscription automatically. Please contact us and we’ll delete your account.' }
    }
    try {
      await stripe.subscriptions.cancel(subId)
    } catch (e) {
      // Already gone on Stripe's side is fine — that's the state we want.
      const code = (e as { code?: string }).code
      if (code !== 'resource_missing') {
        console.error('deleteAccount: Stripe cancel failed:', e)
        return { error: 'We couldn’t cancel your subscription, so nothing has been deleted. Please try again or contact us.' }
      }
    }
  }

  // 2. Remove stored files.
  const { data: logos } = await admin.storage.from('firm-logos').list(user.id)
  if (logos && logos.length > 0) {
    const { error: removeError } = await admin.storage
      .from('firm-logos')
      .remove(logos.map((f) => `${user.id}/${f.name}`))
    if (removeError) {
      console.error('deleteAccount: logo removal failed:', removeError.message)
      return { error: 'We couldn’t delete your account. Please try again, or contact us and we’ll do it for you.' }
    }
  }

  // 3. Delete the user and, by cascade, everything linked to them.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    console.error('deleteAccount: deleteUser failed:', deleteError.message)
    return { error: 'We couldn’t delete your account. Please try again, or contact us and we’ll do it for you.' }
  }

  // The session is dead server-side already; this clears the cookies.
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/account-deleted')
}
