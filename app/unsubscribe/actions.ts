'use server'

// Form actions for the public unsubscribe page. No session: the signed u/t
// pair from the email link is re-verified here on every submit, because a form
// post can carry any values the sender likes.

import { redirect } from 'next/navigation'
import { verifyUnsubscribe } from '@/lib/email/unsubscribe'
import { setEmailsUnsubscribed } from '@/lib/email/subscription'

async function apply(formData: FormData, unsubscribed: boolean, doneState: string) {
  const u = String(formData.get('u') ?? '')
  const t = String(formData.get('t') ?? '')
  const q = new URLSearchParams({ u, t })

  if (!verifyUnsubscribe(u, t)) redirect('/unsubscribe')

  const ok = await setEmailsUnsubscribed(u, unsubscribed)
  q.set('state', ok ? doneState : 'error')
  redirect(`/unsubscribe?${q}`)
}

export async function unsubscribeAction(formData: FormData) {
  await apply(formData, true, 'unsubscribed')
}

export async function resubscribeAction(formData: FormData) {
  await apply(formData, false, 'resubscribed')
}
