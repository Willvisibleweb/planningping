import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

// Every list, table and panel gets one of these instead of a blank box.
//
// The copy rule: say what will appear here and how to make it appear. "No
// results" tells someone nothing they can't already see.

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'md',
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  /** `sm` for empty panels inside a populated page; `md` for a whole view. */
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'sm' ? 'px-5 py-10' : 'px-6 py-16',
        className,
      )}
    >
      {Icon && (
        <div
          className={cn(
            'mb-4 grid place-items-center rounded-full bg-primary-50 text-primary-500 ring-1 ring-inset ring-primary-200',
            size === 'sm' ? 'size-10' : 'size-12',
          )}
        >
          <Icon size={size === 'sm' ? 18 : 22} aria-hidden="true" />
        </div>
      )}

      <p
        className={cn(
          'font-semibold tracking-tight text-ink',
          size === 'sm' ? 'text-sm' : 'text-base',
        )}
      >
        {title}
      </p>

      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">
          {description}
        </p>
      )}

      {action && <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  )
}
