'use client'

// Makes the server-resolved feature set available to client components.
//
// The dashboard layout already loads the profile, so the flags are computed
// server-side and passed down as a plain object rather than re-fetched in the
// browser. That means no request waterfall, and no frame where a partner
// control renders before we know whether the user is a partner — which is the
// failure mode that would leak a partnership to someone who isn't in one.

import { createContext, useContext } from 'react'
import type { UserFeatures } from '@/lib/features'

const FeaturesContext = createContext<UserFeatures | null>(null)

export function FeaturesProvider({
  features,
  children,
}: {
  features: UserFeatures
  children: React.ReactNode
}) {
  return <FeaturesContext.Provider value={features}>{children}</FeaturesContext.Provider>
}

/**
 * Feature flags for the signed-in user.
 *
 * Fails closed: outside a provider every flag is false, so a component that
 * ends up rendered somewhere unexpected hides partner UI rather than showing
 * it. Server components should call getUserFeatures(profile) directly instead.
 */
export function useUserFeatures(): UserFeatures {
  return (
    useContext(FeaturesContext) ?? {
      partnershipProvider: null,
      hasPartnership: false,
      siteMonitoring: false,
      partnerWidget: false,
    }
  )
}
