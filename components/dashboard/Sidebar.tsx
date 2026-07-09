'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Target,
  KanbanSquare,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
} from 'lucide-react'

interface Props {
  userEmail: string
  professional: boolean
  onTrial: boolean
  daysLeft: number | null
}

const STORAGE_KEY = 'pp:sidebar-collapsed'

export default function Sidebar({ userEmail, professional, onTrial, daysLeft }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Restore the collapsed preference on mount (client-only; avoids hydration
  // mismatch by defaulting to expanded until we've read localStorage).
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === '1') setCollapsed(true)
  }, [])

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  function handleLogout() {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
    })
  }

  const nav = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/leads', label: 'Leads', icon: Target },
    ...(professional ? [{ href: '/pipeline', label: 'Pipeline', icon: KanbanSquare }] : []),
    { href: '/settings', label: 'Settings', icon: Settings },
  ]

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Shared inner content, reused by the desktop rail and the mobile drawer.
  // `showLabels` is false only for the collapsed desktop rail.
  function Inner({ showLabels }: { showLabels: boolean }) {
    return (
      <div className="flex h-full flex-col">
        {/* Brand + collapse toggle */}
        <div className={`flex h-14 items-center border-b border-gray-200 ${showLabels ? 'justify-between px-4' : 'justify-center px-2'}`}>
          {showLabels && (
            <a href="/dashboard" className="text-base font-semibold tracking-tight text-gray-900">
              Planning<span className="text-[#2563EB]">Ping</span>
            </a>
          )}
          <button
            onClick={toggleCollapsed}
            className="hidden rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 lg:block"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = isActive(href)
            return (
              <a
                key={href}
                href={href}
                title={!showLabels ? label : undefined}
                className={[
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  !showLabels && 'justify-center px-0',
                  active
                    ? 'bg-[#EFF4FF] text-[#2563EB]'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                ].filter(Boolean).join(' ')}
              >
                <Icon size={18} className="shrink-0" />
                {showLabels && <span>{label}</span>}
              </a>
            )
          })}
        </nav>

        {/* Footer: trial, account, sign out */}
        <div className="border-t border-gray-200 p-3">
          {onTrial && showLabels && (
            <a
              href="/settings#billing"
              className="mb-3 block rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-[#2563EB] hover:bg-blue-100"
            >
              Trial: {daysLeft} day{daysLeft === 1 ? '' : 's'} left
            </a>
          )}
          {showLabels ? (
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-100 text-xs font-semibold uppercase text-gray-600">
                {userEmail.charAt(0)}
              </div>
              <span className="min-w-0 flex-1 truncate text-xs text-gray-500" title={userEmail}>
                {userEmail}
              </span>
              <button
                onClick={handleLogout}
                disabled={isPending}
                className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              disabled={isPending}
              className="flex w-full justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4 lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <a href="/dashboard" className="text-base font-semibold tracking-tight text-gray-900">
          Planning<span className="text-[#2563EB]">Ping</span>
        </a>
      </div>

      {/* Desktop rail */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 border-r border-gray-200 bg-white transition-[width] duration-200 ease-out lg:block ${collapsed ? 'w-16' : 'w-60'}`}
      >
        <Inner showLabels={!collapsed} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-gray-900/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
            <Inner showLabels={true} />
          </div>
        </div>
      )}
    </>
  )
}
