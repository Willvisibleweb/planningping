// Login rate limiting.
//
// Supabase caps its token endpoint at 1800 requests per hour per IP — thirty
// password guesses a minute — so on its own it does not stop someone working
// through a list against a known address. This adds a real lockout on top.
//
// Two independent limits, because they stop different attacks:
//   per email — one account being guessed at, however many machines are used
//   per IP    — one common password sprayed across many accounts
//
// Failing OPEN is deliberate. If the rate-limit query itself errors, the login
// proceeds. A database hiccup locking every customer out of their own account
// is a worse outcome than briefly losing brute-force protection, and Supabase's
// own limit is still underneath.

import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

const WINDOW_MINUTES = 15
const MAX_FAILURES_PER_EMAIL = 5
const MAX_FAILURES_PER_IP = 20
// Attempts older than this are pruned opportunistically — there is no cron for
// it, and the table would otherwise grow forever.
const RETAIN_HOURS = 24

export interface RateLimitResult {
  allowed: boolean
  /** Message to show the user. Never says which limit was hit, or whether the
   *  email exists — both would help someone probing for valid accounts. */
  message?: string
}

/**
 * The caller's IP, as far as the platform can tell.
 *
 * x-forwarded-for is client-controllable in general, but on Vercel the proxy
 * rewrites it, so the FIRST entry is the real client. Taking the last entry (a
 * common mistake) would let anyone send their own header and dodge the limit.
 */
async function clientIp(): Promise<string | null> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return h.get('x-real-ip')
}

/** Normalised so Bob@Example.com and bob@example.com share a bucket. */
function normalise(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Check before attempting a login. Call recordAttempt() afterwards with the
 * outcome.
 */
export async function checkRateLimit(email: string): Promise<RateLimitResult> {
  try {
    const supabase = createAdminClient()
    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString()
    const identifier = normalise(email)
    const ip = await clientIp()

    const [{ count: emailFailures }, ipResult] = await Promise.all([
      supabase
        .from('auth_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('identifier', identifier)
        .eq('succeeded', false)
        .gte('created_at', since),
      ip
        ? supabase
            .from('auth_attempts')
            .select('*', { count: 'exact', head: true })
            .eq('ip', ip)
            .eq('succeeded', false)
            .gte('created_at', since)
        : Promise.resolve({ count: 0 }),
    ])

    const overEmail = (emailFailures ?? 0) >= MAX_FAILURES_PER_EMAIL
    const overIp = (ipResult.count ?? 0) >= MAX_FAILURES_PER_IP

    if (overEmail || overIp) {
      return {
        allowed: false,
        message: `Too many sign-in attempts. Try again in ${WINDOW_MINUTES} minutes, or reset your password.`,
      }
    }

    return { allowed: true }
  } catch {
    // See the note at the top: a broken limiter must not lock anyone out.
    return { allowed: true }
  }
}

/**
 * Record the outcome. A success clears that email's failures immediately, so
 * someone who mistypes four times and then gets it right isn't left one slip
 * away from a lockout for the rest of the window.
 */
export async function recordAttempt(email: string, succeeded: boolean): Promise<void> {
  try {
    const supabase = createAdminClient()
    const identifier = normalise(email)
    const ip = await clientIp()

    await supabase.from('auth_attempts').insert({ identifier, ip, succeeded })

    if (succeeded) {
      await supabase
        .from('auth_attempts')
        .delete()
        .eq('identifier', identifier)
        .eq('succeeded', false)
    }

    // Opportunistic prune, roughly 1 in 20 calls. Cheap, keeps the table from
    // growing without needing its own scheduled job.
    if (Math.random() < 0.05) {
      const cutoff = new Date(Date.now() - RETAIN_HOURS * 3_600_000).toISOString()
      await supabase.from('auth_attempts').delete().lt('created_at', cutoff)
    }
  } catch {
    // Never let logging an attempt break a legitimate sign-in.
  }
}
