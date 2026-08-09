'use server'

// Two-factor enrolment and removal.
//
// All of this runs server-side so the session upgrade to aal2 is written to
// the auth cookie by the SSR client. Doing it in the browser would leave the
// server-rendered dashboard still seeing an aal1 session and bouncing the user
// straight back to the challenge screen.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getMfaState } from '@/lib/auth/mfa'

const FRIENDLY_NAME = 'Authenticator app'

export interface EnrolStart {
  factorId: string
  /** SVG data URL, ready to drop straight into an <img src>. */
  qrCode: string
  /** For typing in by hand when a camera isn't available. */
  secret: string
}

export type EnrolResult = { ok: true; data: EnrolStart } | { ok: false; error: string }

export async function startTotpEnrolment(): Promise<EnrolResult> {
  const supabase = await createClient()

  // Abandoned enrolments block a fresh one — Supabase rejects a second factor
  // with the same friendly name. Someone who opens this panel, closes it, and
  // comes back later would otherwise be stuck forever with no way out.
  const state = await getMfaState()
  for (const id of state.unverifiedFactorIds) {
    await supabase.auth.mfa.unenroll({ factorId: id })
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: FRIENDLY_NAME,
  })

  if (error || !data) {
    return { ok: false, error: 'Could not start setup. Please try again.' }
  }

  return {
    ok: true,
    data: {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    },
  }
}

export async function confirmTotpEnrolment(factorId: string, code: string) {
  const clean = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) {
    return { error: 'Enter the 6-digit code from your authenticator app.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: clean,
  })

  if (error) {
    // Codes rotate every 30 seconds, and a phone clock that has drifted is the
    // usual cause rather than the wrong app.
    return { error: 'That code didn’t work. It changes every 30 seconds — try the current one.' }
  }

  revalidatePath('/settings')
  revalidatePath('/dashboard')
  return {}
}

export async function disableTotp() {
  const supabase = await createClient()
  const state = await getMfaState()

  if (!state.factorId) return { error: 'Two-factor authentication isn’t switched on.' }

  // Supabase requires an aal2 session to unenrol, which is the behaviour we
  // want: someone who has stolen a password-only session cannot strip 2FA off
  // the account.
  const { error } = await supabase.auth.mfa.unenroll({ factorId: state.factorId })

  if (error) {
    return { error: 'Could not turn off two-factor authentication. Please try again.' }
  }

  revalidatePath('/settings')
  revalidatePath('/dashboard')
  return {}
}

export async function verifyChallenge(code: string) {
  const clean = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) {
    return { error: 'Enter the 6-digit code from your authenticator app.' }
  }

  const supabase = await createClient()
  const state = await getMfaState()
  if (!state.factorId) return { error: 'No authenticator app is set up on this account.' }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: state.factorId,
    code: clean,
  })

  if (error) {
    return { error: 'That code didn’t work. It changes every 30 seconds — try the current one.' }
  }

  revalidatePath('/', 'layout')
  return {}
}
