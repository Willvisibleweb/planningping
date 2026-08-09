// Dashboard layout — the authoritative auth gate for all dashboard routes.
// Even if middleware is bypassed somehow, this server component validates the
// session before rendering any protected content.

import { redirect } from 'next/navigation'
import { getProfile, isProfessional, hasProAccess, trialDaysLeft } from '@/lib/access'
import { getUserFeatures } from '@/lib/features'
import { FeaturesProvider } from '@/components/features/FeaturesProvider'
import Sidebar from '@/components/dashboard/Sidebar'
import Link from 'next/link'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // getProfile() does its own auth.getUser() check internally — calling
  // supabase.auth.getUser() again here would be a second, redundant round
  // trip to Supabase Auth on every single dashboard page load. profile.email
  // covers what the separate user object was used for below.
  const profile = await getProfile()

  // Hard redirect — no session (or no profile row, which shouldn't happen for
  // a real authenticated user) means no access, full stop.
  if (!profile) redirect('/login')

  // Nav is tailored by account type. This is display only — every pro page
  // and server action re-checks access itself (see lib/access.ts).
  const professional = isProfessional(profile)
  const daysLeft = trialDaysLeft(profile)
  const onTrial = professional && hasProAccess(profile) && daysLeft !== null

  // Flags are resolved once, server-side, from the profile the layout already
  // loaded — see components/features/FeaturesProvider for why they aren't
  // fetched again in the browser.
  const features = getUserFeatures(profile)

  // Partner theming is one attribute, not a second set of components. Every
  // surface already reads the semantic colour tokens, so data-theme re-points
  // those tokens and the whole dashboard re-skins — see the [data-theme] block
  // in app/globals.css. Non-partners get no attribute and no change at all.
  const theme = features.partnershipProvider ?? undefined

  return (
    <FeaturesProvider features={features}>
    <div data-theme={theme} className="min-h-screen bg-surface lg:flex">
      <Sidebar
        userEmail={profile.email}
        professional={professional}
        onTrial={onTrial}
        daysLeft={daysLeft}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 lg:px-8">
          {children}
        </main>

        {/* Persistent legal disclaimer — subtle, present on every dashboard view. */}
        <footer className="border-t border-border">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8">
            <p className="max-w-3xl text-xs leading-relaxed text-ink-muted">
              PlanningPing is an alerting tool, not professional advice. Planning data is
              collected from public portals and may be incomplete, delayed, or inaccurate.
              Always verify against the official planning authority before acting.
            </p>
            <p className="mt-2.5 text-xs text-ink-muted">
              <Link href="/terms" className="pp-link-muted">Terms of Service</Link>
              {' · '}
              <Link href="/privacy" className="pp-link-muted">Privacy Policy</Link>
            </p>
          </div>
        </footer>
      </div>
    </div>
    </FeaturesProvider>
  )
}
