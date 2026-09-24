// Writes a user's email subscription state. Service-role, because 0006 locks
// profiles against user-scoped updates — so every caller must have proved who
// the user is first (a verified unsubscribe signature, or a session).
//
// Server-side only.

import { createAdminClient } from '@/lib/supabase/admin'
import { isLocationSubject, locationSubscriptionId } from '@/lib/email/unsubscribe'

/**
 * Unsubscribe whoever this signed subject identifies.
 *
 * Two kinds of subscriber reach here through the same link, page and one-click
 * route: an account holder, and someone who only ever gave an email address on
 * a public location page. The caller has already verified the signature; all
 * that differs is which row to write.
 */
export async function setEmailsUnsubscribed(subject: string, unsubscribed: boolean): Promise<boolean> {
  if (isLocationSubject(subject)) return setLocationUnsubscribed(locationSubscriptionId(subject), unsubscribed)

  const userId = subject
  const admin = createAdminClient()
  const query = admin
    .from('profiles')
    .update({ emails_unsubscribed_at: unsubscribed ? new Date().toISOString() : null })
    .eq('id', userId)

  // Unsubscribing twice keeps the original timestamp — that is the moment
  // they asked, and a mail client re-POSTing the one-click header shouldn't
  // move it.
  const { error } = unsubscribed ? await query.is('emails_unsubscribed_at', null) : await query

  if (error) {
    console.error('setEmailsUnsubscribed failed:', error.message)
    return false
  }
  return true
}

async function setLocationUnsubscribed(subscriptionId: string, unsubscribed: boolean): Promise<boolean> {
  const admin = createAdminClient()
  const query = admin
    .from('location_subscriptions')
    .update({ unsubscribed_at: unsubscribed ? new Date().toISOString() : null })
    .eq('id', subscriptionId)

  // Same reasoning as the profile path: re-POSTing the one-click header must
  // not move the moment they asked.
  const { error } = unsubscribed ? await query.is('unsubscribed_at', null) : await query

  if (error) {
    console.error('setLocationUnsubscribed failed:', error.message)
    return false
  }
  return true
}
