// Rate limiting and daily caps for the AI endpoints.
//
// Every one of these routes makes a billed Anthropic call, so the limit has to
// hold even when someone fires a hundred requests at once. The decision lives
// in a Postgres function (migration 0030) rather than here: counting rows and
// then inserting one is two statements, and two statements race. One function
// call under an advisory lock does not.
//
// The slot is reserved BEFORE the model is called — a limit applied after the
// expensive thing has happened is not a limit — and released if the call
// fails, so a failure still costs the user nothing.
//
// Both halves run through the admin client on purpose. outreach_log has no
// update or delete policy (0007) so that a user cannot clear their own count
// to reset the cap; exposing the release path to the user's own session would
// have handed that back. Server-side only, both ways.

import { createAdminClient } from '@/lib/supabase/admin'

export type AiKind = 'chat' | 'summary' | 'email' | 'letter'

export type QuotaResult =
  | { allowed: true; slotId: string; remaining: number }
  | { allowed: false; status: 429; message: string }

const DENIAL: Record<string, string> = {
  burst: 'You’re going a bit fast — give it a minute and try again.',
  daily: 'You’ve used today’s allowance. It resets at midnight UTC.',
}

/**
 * Reserve one call for this user and feature, or refuse.
 *
 * Fails closed: if the function errors or is unreachable we deny rather than
 * wave the request through, because the thing on the other side costs money.
 */
export async function consumeAiQuota(
  userId: string,
  kind: AiKind,
  // Outreach ties its log rows to a lead; the other features have nothing to
  // attach, so this stays optional rather than every caller passing null.
  leadId?: string,
): Promise<QuotaResult> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('consume_ai_quota', {
    p_user_id: userId,
    p_kind: kind,
    p_lead_id: leadId ?? null,
  })

  if (error) {
    console.error('consume_ai_quota failed:', error.message)
    return { allowed: false, status: 429, message: 'Too busy right now — try again shortly.' }
  }

  const result = data as { allowed: boolean; reason?: string; id?: string; remaining?: number }

  if (!result?.allowed) {
    return {
      allowed: false,
      status: 429,
      message: DENIAL[result?.reason ?? ''] ?? 'Limit reached — try again shortly.',
    }
  }

  return { allowed: true, slotId: result.id!, remaining: result.remaining ?? 0 }
}

/**
 * Hand back a reserved slot after a failed call.
 *
 * Best-effort: if the delete fails the user loses one call from their day,
 * which is a far better outcome than propagating a second error over the top
 * of the one they already hit. Logged so it is visible if it ever happens.
 */
export async function releaseAiQuota(slotId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('outreach_log').delete().eq('id', slotId)
    if (error) console.error('releaseAiQuota failed:', error.message)
  } catch (e) {
    console.error('releaseAiQuota threw:', e)
  }
}
