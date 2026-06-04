// Dashboard layout — the authoritative auth gate for all dashboard routes.
// Even if middleware is bypassed somehow, this server component validates the
// session before rendering any protected content.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/dashboard/LogoutButton'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Hard redirect — no session means no access, full stop.
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <a href="/dashboard" className="text-lg font-semibold text-gray-900">
            PlanningPing
          </a>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user.email}</span>
            <a href="/settings" className="text-sm text-gray-600 hover:text-gray-900">
              Settings
            </a>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {children}
      </main>
    </div>
  )
}
