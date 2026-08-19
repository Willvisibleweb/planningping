'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Target,
  KanbanSquare,
  BarChart3,
  Gavel,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  Map,
  HelpCircle,
  Mail,
  type LucideIcon,
} from 'lucide-react'

interface Props {
  userEmail: string
  professional: boolean
  onTrial: boolean
  daysLeft: number | null
}

const STORAGE_KEY = 'pp:sidebar-collapsed'

// The collapsed preference lives in localStorage, which is an external store —
// so it's read with useSyncExternalStore rather than an effect that setStates
// on mount. That avoids the cascading render the old pattern caused, and syncs
// the rail across tabs for free via the storage event.
const collapseListeners = new Set<() => void>()

function subscribeCollapsed(onChange: () => void) {
  collapseListeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    collapseListeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

function getCollapsedSnapshot() {
  return localStorage.getItem(STORAGE_KEY) === '1'
}

// The server can't know the preference, so it renders expanded — same as the
// old default. React reconciles to the stored value after hydration.
function getCollapsedServerSnapshot() {
  return false
}

function writeCollapsed(next: boolean) {
  localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  // The storage event only fires in *other* tabs, so notify this one directly.
  collapseListeners.forEach((cb) => cb())
}

const CORE_NAV = (professional: boolean) => [
  { href: '/dashboard', label: 'Territories', icon: LayoutDashboard },
  { href: '/leads', label: 'Opportunities', icon: Target },
  ...(professional ? [{ href: '/pipeline', label: 'Pipeline', icon: KanbanSquare }] : []),
  ...(professional ? [{ href: '/tenders', label: 'Tenders', icon: Gavel }] : []),
  ...(professional ? [{ href: '/analytics', label: 'Analytics', icon: BarChart3 }] : []),
  { href: '/settings', label: 'Settings', icon: Settings },
]

// Informational/support destinations — separate from the core workflow so the
// sidebar reads as structured (workspace vs. resources), not a flat list.
const RESOURCE_NAV = [
  { href: '/coverage', label: 'Coverage', icon: Map },
  { href: '/how-it-works', label: 'How it works', icon: HelpCircle },
  { href: '/contact', label: 'Contact us', icon: Mail },
]

// Small chrome buttons (collapse toggle, sign out, drawer close) share this.
const ICON_BUTTON =
  'rounded-sm p-1.5 text-neutral-500 transition-colors duration-fast ease-standard ' +
  'hover:bg-primary-50 hover:text-ink ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 ' +
  'disabled:opacity-50'

/**
 * One nav row. Previously this class string was duplicated across the core and
 * resource lists, which is how the two drifted apart in the first place.
 *
 * The active row gets a left accent bar as well as a tint — colour alone is a
 * weak signal, and a 3px rule reads instantly in peripheral vision.
 */
function NavLink({
  href,
  label,
  icon: Icon,
  active,
  showLabel,
}: {
  href: string
  label: string
  icon: LucideIcon
  active: boolean
  showLabel: boolean
}) {
  return (
    <a
      href={href}
      title={!showLabel ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={[
        'group relative flex items-center gap-3 rounded-sm py-2 text-sm font-medium',
        'transition-[background-color,color] duration-fast ease-standard',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45',
        showLabel ? 'px-3' : 'justify-center px-0',
        active
          ? 'bg-primary-100 text-primary-700'
          : 'text-ink-muted hover:bg-primary-50 hover:text-ink',
      ].join(' ')}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-primary-500"
        />
      )}
      <Icon size={18} className="shrink-0" aria-hidden="true" />
      {showLabel && <span className="truncate">{label}</span>}
    </a>
  )
}

function SidebarInner({
  showLabels,
  collapsed,
  onToggleCollapsed,
  coreNav,
  isActive,
  onTrial,
  daysLeft,
  userEmail,
  onLogout,
  loggingOut,
}: {
  showLabels: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
  coreNav: { href: string; label: string; icon: LucideIcon }[]
  isActive: (href: string) => boolean
  onTrial: boolean
  daysLeft: number | null
  userEmail: string
  onLogout: () => void
  loggingOut: boolean
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Brand + collapse toggle */}
      <div
        className={`flex h-14 shrink-0 items-center border-b border-border ${
          showLabels ? 'justify-between px-4' : 'justify-center px-2'
        }`}
      >
        {showLabels && (
          <Link
            href="/dashboard"
            className="rounded-sm text-base font-semibold tracking-tight text-ink transition-colors duration-fast ease-standard hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
          >
            Planning<span className="text-primary-500">Ping</span>
          </Link>
        )}
        <button
          onClick={onToggleCollapsed}
          className={`hidden lg:block ${ICON_BUTTON}`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {coreNav.map(({ href, label, icon }) => (
          <NavLink
            key={href}
            href={href}
            label={label}
            icon={icon}
            active={isActive(href)}
            showLabel={showLabels}
          />
        ))}

        {showLabels ? (
          <p className="mb-1 mt-5 px-3 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            Resources
          </p>
        ) : (
          <div className="my-2.5 border-t border-border" />
        )}

        {RESOURCE_NAV.map(({ href, label, icon }) => (
          <NavLink
            key={href}
            href={href}
            label={label}
            icon={icon}
            active={isActive(href)}
            showLabel={showLabels}
          />
        ))}
      </nav>

      {/* Footer: trial, account, sign out */}
      <div className="shrink-0 border-t border-border p-3">
        {onTrial && showLabels && (
          <Link
            href="/settings#billing"
            className="mb-3 block rounded-sm bg-primary-100 px-3 py-2 text-xs font-medium text-primary-700 transition-colors duration-fast ease-standard hover:bg-primary-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45"
          >
            Trial: {daysLeft} day{daysLeft === 1 ? '' : 's'} left
          </Link>
        )}
        {showLabels ? (
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-100 text-xs font-semibold uppercase text-primary-700">
              {userEmail.charAt(0)}
            </div>
            <span className="min-w-0 flex-1 truncate text-xs text-ink-muted" title={userEmail}>
              {userEmail}
            </span>
            <button
              onClick={onLogout}
              disabled={loggingOut}
              className={ICON_BUTTON}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={onLogout}
            disabled={loggingOut}
            className={`flex w-full justify-center ${ICON_BUTTON}`}
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

export default function Sidebar({ userEmail, professional, onTrial, daysLeft }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    getCollapsedSnapshot,
    getCollapsedServerSnapshot,
  )
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const drawerRef = useRef<HTMLDivElement>(null)
  // Remembers what had focus before the drawer opened, so closing it returns
  // focus to the menu button rather than dumping it at the top of the document.
  const openerRef = useRef<HTMLElement | null>(null)

  const toggleCollapsed = useCallback(() => {
    writeCollapsed(!getCollapsedSnapshot())
  }, [])

  // Close the mobile drawer on navigation. Done by adjusting state during
  // render — React's documented pattern for derived state — rather than in an
  // effect, which would render the stale open drawer for a frame first.
  const [pathAtRender, setPathAtRender] = useState(pathname)
  if (pathAtRender !== pathname) {
    setPathAtRender(pathname)
    if (mobileOpen) setMobileOpen(false)
  }

  const closeDrawer = useCallback(() => {
    setMobileOpen(false)
    openerRef.current?.focus()
  }, [])

  // Drawer behaviour a mobile nav needs to not feel like an afterthought:
  // Escape closes it, focus moves into it on open, Tab is trapped inside it
  // while it's up, and the page behind it can't scroll.
  useEffect(() => {
    if (!mobileOpen) return

    const drawer = drawerRef.current
    drawer?.querySelector<HTMLElement>('a, button')?.focus()

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeDrawer()
        return
      }
      if (e.key !== 'Tab' || !drawer) return

      const focusables = drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
    }
  }, [mobileOpen, closeDrawer])

  function handleLogout() {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
    })
  }

  const coreNav = CORE_NAV(professional)

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  const innerProps = {
    collapsed,
    onToggleCollapsed: toggleCollapsed,
    coreNav,
    isActive,
    onTrial,
    daysLeft,
    userEmail,
    onLogout: handleLogout,
    loggingOut: isPending,
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4 lg:hidden">
        <button
          onClick={(e) => {
            openerRef.current = e.currentTarget
            setMobileOpen(true)
          }}
          className={ICON_BUTTON}
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
        >
          <Menu size={20} />
        </button>
        <Link
          href="/dashboard"
          className="rounded-sm text-base font-semibold tracking-tight text-ink transition-colors duration-fast ease-standard hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
        >
          Planning<span className="text-primary-500">Ping</span>
        </Link>
      </div>

      {/* Desktop rail */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 border-r border-border bg-surface transition-[width] duration-slow ease-standard lg:block ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <SidebarInner showLabels={!collapsed} {...innerProps} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-neutral-900/40 animate-enter-fade"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            id="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className="absolute inset-y-0 left-0 w-64 animate-drawer bg-surface shadow-lg"
          >
            <button
              onClick={closeDrawer}
              className={`absolute right-3 top-3 z-10 ${ICON_BUTTON}`}
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
            <SidebarInner showLabels {...innerProps} />
          </div>
        </div>
      )}
    </>
  )
}
