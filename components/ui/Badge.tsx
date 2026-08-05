import { cn } from '@/lib/cn'
import type { LucideIcon } from 'lucide-react'

// Status pills. Every tone pairs a semantic surface with a foreground that
// clears WCAG AA on it — no more bg-gray-100/text-gray-600 defaults sitting
// next to hand-picked hexes.

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

const TONES: Record<Tone, string> = {
  neutral: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
  primary: 'bg-primary-50 text-primary-700 ring-primary-200',
  success: 'bg-success-50 text-success-600 ring-success-200',
  warning: 'bg-warning-50 text-warning-600 ring-warning-200',
  danger: 'bg-danger-50 text-danger-600 ring-danger-200',
}

export default function Badge({
  tone = 'neutral',
  icon: Icon,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone
  icon?: LucideIcon
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
        'text-2xs font-medium ring-1 ring-inset',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {Icon && <Icon size={12} className="shrink-0" aria-hidden="true" />}
      {children}
    </span>
  )
}
