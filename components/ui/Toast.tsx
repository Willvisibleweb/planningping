'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/cn'

// Toasts, in-house — about eighty lines, versus a dependency for the same
// thing. Replaces the app's silent mutations: things like tracking an
// opportunity or saving a firm profile previously succeeded with no
// confirmation at all.

type ToastVariant = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  title: string
  description?: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (t: Omit<ToastItem, 'id'> & { variant?: ToastVariant }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/**
 * Returns `toast({ title, description?, variant? })`.
 *
 * Safe to call from any client component under the provider. If the provider
 * is missing it no-ops rather than throwing — a missing confirmation message
 * should never be the thing that takes a page down.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  return useMemo(
    () =>
      ctx ?? {
        toast: () => {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('useToast() called outside <ToastProvider>; toast ignored.')
          }
        },
      },
    [ctx],
  )
}

const VARIANTS: Record<
  ToastVariant,
  { icon: typeof CheckCircle2; iconClass: string; ring: string }
> = {
  success: { icon: CheckCircle2, iconClass: 'text-success-600', ring: 'ring-success-200' },
  error: { icon: AlertCircle, iconClass: 'text-danger-600', ring: 'ring-danger-200' },
  info: { icon: Info, iconClass: 'text-primary-500', ring: 'ring-primary-200' },
}

const DURATION_MS = 5000

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setItems((cur) => cur.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback<ToastContextValue['toast']>(
    ({ title, description, variant = 'info' }) => {
      const id = nextId.current++
      setItems((cur) => [...cur.slice(-2), { id, title, description, variant }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS),
      )
    },
    [dismiss],
  )

  // Clear any outstanding timers if the provider unmounts mid-flight.
  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* No isMounted effect: a toast can only exist after a user interaction,
          so `items` is empty on the server and on the hydrating client alike.
          Gating on length means document is only touched once we're
          definitively client-side, and server and client markup still match. */}
      {items.length > 0 &&
        createPortal(
          <div
            // polite, not assertive: a success confirmation shouldn't interrupt
            // whatever a screen reader is currently reading.
            aria-live="polite"
            aria-atomic="false"
            className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
          >
            {items.map((t) => {
              const { icon: Icon, iconClass, ring } = VARIANTS[t.variant]
              return (
                <div
                  key={t.id}
                  role={t.variant === 'error' ? 'alert' : 'status'}
                  className={cn(
                    'pointer-events-auto flex w-full max-w-sm items-start gap-3',
                    'rounded-md bg-surface p-4 shadow-lg ring-1',
                    'animate-enter',
                    ring,
                  )}
                >
                  <Icon size={17} className={cn('mt-px shrink-0', iconClass)} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold tracking-tight text-ink">{t.title}</p>
                    {t.description && (
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss notification"
                    className={
                      '-m-1 shrink-0 rounded-sm p-1 text-neutral-500 ' +
                      'transition-colors duration-fast ease-standard hover:bg-neutral-100 hover:text-ink ' +
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45'
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}
