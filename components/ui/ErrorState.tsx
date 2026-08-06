import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/cn'

// Errors say what happened and what to do about it. They don't apologise, and
// they don't say "something went wrong" — that tells the reader nothing they
// hadn't already worked out.
//
// Two shapes: `Alert` for inline messages inside a form or panel, and
// `ErrorState` for a whole view that failed to load.

export function Alert({
  tone = 'danger',
  title,
  className,
  children,
}: {
  tone?: 'danger' | 'warning' | 'info' | 'success'
  title?: string
  className?: string
  children: React.ReactNode
}) {
  const TONES = {
    danger: 'bg-danger-50 text-danger-700 ring-danger-200',
    warning: 'bg-warning-50 text-warning-700 ring-warning-200',
    info: 'bg-primary-50 text-primary-700 ring-primary-200',
    success: 'bg-success-50 text-success-700 ring-success-200',
  } as const

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'rounded-sm px-3.5 py-3 text-sm leading-relaxed ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {title && <p className="font-semibold tracking-tight">{title}</p>}
      <div className={cn(title && 'mt-0.5')}>{children}</div>
    </div>
  )
}

export default function ErrorState({
  title = 'This didn’t load',
  description,
  action,
  className,
}: {
  title?: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-16 text-center',
        className,
      )}
    >
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-danger-50 text-danger-600 ring-1 ring-inset ring-danger-200">
        <AlertTriangle size={22} aria-hidden="true" />
      </div>
      <p className="text-base font-semibold tracking-tight text-ink">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  )
}
