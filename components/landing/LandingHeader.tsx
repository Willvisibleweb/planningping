'use client'

// Public site header.
//
// Every link points at something that exists. The previous header was three
// items, which made the product look smaller than it is, but the fix for that
// is not inventing a nav full of dead links — a "Resources" menu leading
// nowhere is worse than no menu. So: in-page anchors for the sections this
// page actually has, and real routes for the pages that actually exist.

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'

const NAV = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#who-its-for', label: "Who it's for" },
  { href: '#coverage', label: 'Coverage' },
  { href: '#pricing', label: 'Pricing' },
  { href: '/blog', label: 'Blog' },
]

export default function LandingHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-6 px-5 sm:px-8">
        <Link
          href="/"
          className="shrink-0 rounded-sm text-sm font-semibold tracking-tight text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
        >
          Planning<span className="text-primary-500">Ping</span>
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-6 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-sm text-sm text-ink-muted transition-colors duration-fast ease-standard hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-4 md:flex">
          <Link
            href="/login"
            className="rounded-sm text-sm font-medium text-ink-muted transition-colors duration-fast ease-standard hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="pp-lift inline-flex h-8 items-center rounded-sm bg-primary-500 px-3.5 text-sm font-medium text-white shadow-sm transition-[background-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:bg-primary-600 hover:shadow-primary active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
          >
            Start free
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="-mr-1 rounded-sm p-1 text-ink-muted transition-colors duration-fast ease-standard hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 md:hidden"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div id="mobile-menu" className="border-t border-border bg-surface px-5 py-3 md:hidden">
          <nav aria-label="Main" className="flex flex-col gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="rounded-sm px-1 py-2 text-sm text-ink-muted transition-colors duration-fast ease-standard hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
            <Link href="/login" onClick={() => setOpen(false)} className="text-sm font-medium text-ink-muted">
              Sign in
            </Link>
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 flex-1 items-center justify-center rounded-sm bg-primary-500 px-3.5 text-sm font-medium text-white shadow-sm"
            >
              Start free
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
