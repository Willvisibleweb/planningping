// Dashboard layout — the authoritative auth gate for all dashboard routes.
// Even if middleware is bypassed somehow, this server component validates the
// session before rendering any protected content.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile, isProfessional, hasProAccess, trialDaysLeft } from '@/lib/access'
import Sidebar from '@/components/dashboard/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Hard redirect — no session means no access, full stop.
  if (!user) redirect('/login')

  // Nav is tailored by account type. This is display only — every pro page
  // and server action re-checks access itself (see lib/access.ts).
  const profile = await getProfile()
  const professional = isProfessional(profile)
  const daysLeft = trialDaysLeft(profile)
  const onTrial = professional && hasProAccess(profile) && daysLeft !== null

  return (
    <div className="min-h-screen bg-[#F7F9FF] lg:flex">
      <Sidebar
        userEmail={user.email ?? ''}
        professional={professional}
        onTrial={onTrial}
        daysLeft={daysLeft}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 lg:px-8">
          {children}
        </main>

        {/* Persistent legal disclaimer — subtle, present on every dashboard view. */}
        <footer className="border-t border-gray-200">
          <div className="mx-auto w-full max-w-5xl px-4 py-5 lg:px-8">
            <p className="text-xs leading-relaxed text-gray-400">
              PlanningPing is an alerting tool, not professional advice. Planning data is
              collected from public portals and may be incomplete, delayed, or inaccurate.
              Always verify against the official planning authority before acting.
            </p>
            <p className="mt-2 text-xs text-gray-400">
              <a href="/terms" className="hover:text-gray-600">Terms of Service</a>
              {' · '}
              <a href="/privacy" className="hover:text-gray-600">Privacy Policy</a>
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
