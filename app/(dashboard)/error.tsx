'use client'

// Route-level error boundary for every dashboard page.
//
// The copy rule: say what failed and what the reader can do next. It does not
// apologise, and it does not say "something went wrong" — the reader can see
// that. It also says plainly that saved data is unaffected, because the first
// worry when a tool you pay for breaks is whether you've lost anything.

import { useEffect } from 'react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import ErrorState from '@/components/ui/ErrorState'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard route error:', error)
  }, [error])

  return (
    <ErrorState
      title="This page didn’t load"
      description={
        <>
          The request failed before your data came back. Your territories, leads and
          pipeline are all unaffected — nothing has been lost.
          {error.digest && (
            <>
              {' '}
              <span className="tabular-data text-xs text-neutral-500">
                Reference {error.digest}
              </span>
            </>
          )}
        </>
      }
      action={
        <>
          <Button onClick={reset}>Try again</Button>
          <Link
            href="/contact"
            className="pp-lift inline-flex h-10 items-center rounded-sm border border-border bg-surface px-4 text-sm font-medium text-ink shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:border-primary-300 hover:bg-primary-50 hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
          >
            Report it
          </Link>
        </>
      }
    />
  )
}
