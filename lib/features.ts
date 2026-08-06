// Feature flags derived from a profile.
//
// One place decides what a given account can see, so a partner-only surface
// can't be gated one way on the dashboard and a different way in an email.
// Pure functions over a Profile — no I/O, safe to import from server
// components, server actions, cron routes and (via FeaturesProvider) the
// client.
//
// Gating rule: partner features are hidden, not disabled. A non-partner should
// never see a GabrielCAM control at all — the standard product shouldn't
// advertise a partnership most users have no relationship with.

import type { Profile } from '@/types/database'

// Partner networks with integrated features. Declared here rather than in the
// DB types because it's feature configuration, not a row shape — and keeping
// it free of value imports lets this module be exercised directly by
// tools/check-features.mjs. Kept in step with the CHECK constraint on
// profiles.partnership_provider (migration 0016).
export const PARTNERSHIP_PROVIDERS = ['gabrielcam'] as const
export type PartnershipProvider = (typeof PARTNERSHIP_PROVIDERS)[number]

export interface UserFeatures {
  /** The partner network this account belongs to, if any. */
  partnershipProvider: PartnershipProvider | null
  /** Any partner integration at all — use for "is this a partner account". */
  hasPartnership: boolean
  /** GabrielCAM site-monitoring deployment surfaces. */
  siteMonitoring: boolean
  /** The partner status widget on the dashboard. */
  partnerWidget: boolean
}

const NONE: UserFeatures = {
  partnershipProvider: null,
  hasPartnership: false,
  siteMonitoring: false,
  partnerWidget: false,
}

/**
 * Resolve the feature set for a profile. A null profile (signed out, or a
 * profile row that failed to load) gets nothing — failing closed means a
 * loading glitch can't flash partner UI at someone who isn't one.
 */
export function getUserFeatures(profile: Profile | null): UserFeatures {
  const raw = profile?.partnership_provider ?? null
  if (!raw) return NONE

  // Re-validate against the known list rather than trusting the column. The
  // CHECK constraint should make an unknown value impossible, but if one ever
  // arrived (a hand-written UPDATE, a future provider rolled out to the DB
  // before the app), treating it as "some partner" would light up a widget
  // that then has no metadata to render and throws. Unknown means none.
  if (!(PARTNERSHIP_PROVIDERS as readonly string[]).includes(raw)) return NONE
  const provider = raw as PartnershipProvider

  return {
    partnershipProvider: provider,
    hasPartnership: true,
    siteMonitoring: provider === 'gabrielcam',
    partnerWidget: true,
  }
}

/** Narrow check for a specific partner, for code that is provider-specific. */
export function isPartnerOf(
  profile: Profile | null,
  provider: PartnershipProvider,
): boolean {
  return profile?.partnership_provider === provider
}

// Display metadata, kept out of components so partner naming lives in one file.
export const PARTNER_META: Record<
  PartnershipProvider,
  { name: string; description: string; hubUrl: string; contactEmail: string }
> = {
  gabrielcam: {
    name: 'GabrielCAM',
    description: 'Construction site monitoring cameras and site intelligence.',
    hubUrl: 'https://gabrielcam.com',
    contactEmail: 'hello@gabrielcam.com',
  },
}
