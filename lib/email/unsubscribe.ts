// Unsubscribe links for customer email.
//
// Every customer email carries a link of the form
//   /unsubscribe?u=<user id>&t=<signature>
// which works without logging in — that is the point of an unsubscribe link.
// The signature is what stops someone unsubscribing another person by guessing
// or swapping in their user id: it is an HMAC of the id, and only the server
// can produce one.
//
// The HMAC key is derived from SUPABASE_SERVICE_ROLE_KEY rather than a new
// secret, so there is nothing extra to configure and no way for emails to go
// out with links that cannot be verified. The label keeps this signature from
// being usable for anything else. If the service role key is ever rotated,
// links in old emails stop verifying; the page then tells the reader to
// unsubscribe from settings instead, which is an acceptable failure.
//
// Server-side only.

import { createHmac, timingSafeEqual } from 'node:crypto'

const LABEL = 'planningping:unsubscribe:v1:'

function key(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set; cannot sign unsubscribe links')
  return k
}

export function signUnsubscribe(userId: string): string {
  return createHmac('sha256', key()).update(LABEL + userId).digest('base64url')
}

export function verifyUnsubscribe(userId: string, token: string): boolean {
  if (!userId || !token) return false
  const expected = Buffer.from(signUnsubscribe(userId))
  const given = Buffer.from(token)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/** The human-facing link: a page with a confirm button. */
export function unsubscribePageUrl(siteUrl: string, userId: string): string {
  const q = new URLSearchParams({ u: userId, t: signUnsubscribe(userId) })
  return `${siteUrl.replace(/\/$/, '')}/unsubscribe?${q}`
}

/**
 * Headers that make Gmail, Yahoo and Apple Mail show their own "Unsubscribe"
 * button. The mail client POSTs `List-Unsubscribe=One-Click` to the URL with no
 * user interaction (RFC 8058), so it points at the API route, which acts
 * immediately — unlike the page, which waits for a click so that link scanners
 * prefetching it can't unsubscribe anyone.
 */
export function unsubscribeHeaders(siteUrl: string, userId: string): Record<string, string> {
  const q = new URLSearchParams({ u: userId, t: signUnsubscribe(userId) })
  return {
    'List-Unsubscribe': `<${siteUrl.replace(/\/$/, '')}/api/unsubscribe?${q}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

/**
 * The single check every customer email sender makes before sending. Anything
 * that emails a customer and doesn't call this is a bug.
 */
export function canEmail(profile: { emails_unsubscribed_at?: string | null } | null | undefined): boolean {
  // Loose == so a profile read before migration 0039 (field absent, so
  // undefined) still counts as subscribed. Strict === would silently stop
  // every email if this code ever shipped ahead of the column — and nobody can
  // have unsubscribed before the column exists.
  return !!profile && profile.emails_unsubscribed_at == null
}

// ── Subscribers without an account ───────────────────────────────────────────
//
// The location pages capture an email address and nothing else — no login, no
// profile row, so no profiles.emails_unsubscribed_at to set. They still need a
// working unsubscribe link, and it has to be the same link: one page, one
// header, one route.
//
// The signature already covers an opaque string rather than anything
// user-specific, so a location subscriber is just a differently-shaped subject.
// Prefixing it keeps the two kinds apart, and means a token minted for one can
// never be replayed as the other.

const LOCATION_PREFIX = 'loc:'

export function locationSubject(subscriptionId: string): string {
  return LOCATION_PREFIX + subscriptionId
}

/** True when this signed subject is a location subscriber rather than a user. */
export function isLocationSubject(subject: string): boolean {
  return subject.startsWith(LOCATION_PREFIX)
}

/** The subscription id inside a location subject. */
export function locationSubscriptionId(subject: string): string {
  return subject.slice(LOCATION_PREFIX.length)
}
