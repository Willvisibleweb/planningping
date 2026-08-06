// Root 404. Reached from a bad URL or an explicit notFound() — including a
// planning application whose id doesn't resolve, which is the likeliest way a
// real user lands here (a stale link out of an old digest email).

import Link from 'next/link'
import { FileQuestion } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-5 grid size-12 place-items-center rounded-full bg-primary-50 text-primary-500 ring-1 ring-inset ring-primary-200">
        <FileQuestion size={22} aria-hidden="true" />
      </div>
      <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
        404
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
        There’s nothing at this address
      </h1>
      <p className="mt-2.5 max-w-md text-sm leading-relaxed text-ink-muted">
        The page may have moved, or the planning application it pointed to is no longer
        in our records. Links in older digest emails can go stale this way.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/dashboard"
          className="pp-lift inline-flex h-10 items-center rounded-sm bg-primary-500 px-4 text-sm font-medium text-white shadow-sm transition-[background-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:bg-primary-600 hover:shadow-primary active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
        >
          Go to your dashboard
        </Link>
        <Link
          href="/"
          className="pp-lift inline-flex h-10 items-center rounded-sm border border-border bg-surface px-4 text-sm font-medium text-ink shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:border-primary-300 hover:bg-primary-50 hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
        >
          Home
        </Link>
      </div>
    </div>
  )
}
