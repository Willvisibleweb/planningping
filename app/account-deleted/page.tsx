// Where deleteAccount (app/(dashboard)/settings/accountActions.ts) sends the
// user once their account is gone. Public: they are signed out by then.

import type { Metadata } from 'next'
import Link from 'next/link'
import { UserX } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Account deleted — PlanningPing',
  robots: { index: false, follow: false },
}

export default function AccountDeletedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-5 grid size-12 place-items-center rounded-full bg-primary-50 text-primary-500 ring-1 ring-inset ring-primary-200">
        <UserX size={22} aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Your account has been deleted</h1>
      <p className="mt-2.5 max-w-md text-sm leading-relaxed text-ink-muted">
        Your account and everything in it has been removed, and we won’t email you again. Thanks
        for trying PlanningPing.
      </p>
      <div className="mt-6">
        <Link
          href="/"
          className="pp-lift inline-flex h-10 items-center rounded-sm border border-border bg-surface px-4 text-sm font-medium text-ink shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:border-primary-300 hover:bg-primary-50 hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
        >
          PlanningPing home
        </Link>
      </div>
    </div>
  )
}
