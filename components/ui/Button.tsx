import { cn } from '@/lib/cn'
import Spinner from './Spinner'

// The one button in the app. Every variant transitions, lifts 1px on hover,
// presses down on active, and — the part that matters for a tool people submit
// forms in all day — holds its exact width while loading, so nothing on the
// page reflows when you click it.

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const BASE =
  'pp-lift relative inline-flex items-center justify-center gap-2 rounded-sm font-medium ' +
  'whitespace-nowrap select-none ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-standard ' +
  'hover:-translate-y-px active:translate-y-0 active:duration-75 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2 ' +
  'disabled:pointer-events-none disabled:opacity-55 disabled:shadow-none disabled:translate-y-0'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary-500 text-white shadow-sm hover:bg-primary-600 hover:shadow-primary active:bg-primary-700',
  secondary:
    'border border-border bg-surface text-ink shadow-sm hover:border-primary-300 hover:bg-primary-50 hover:shadow-md active:bg-primary-100',
  ghost:
    'text-ink-muted hover:bg-neutral-100 hover:text-ink active:bg-neutral-200',
  danger:
    'bg-danger-600 text-white shadow-sm hover:bg-danger-700 hover:shadow-md active:bg-danger-700',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  /** Shown instead of children while loading, for screen readers only. */
  loadingLabel?: string
  fullWidth?: boolean
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel = 'Working…',
  fullWidth = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      // A loading button is not disabled — that would drop it out of the tab
      // order mid-interaction and silently move focus. aria-disabled plus
      // pointer-events tells assistive tech it's busy while keeping it focusable.
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      className={cn(
        BASE,
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        loading && 'pointer-events-none',
        className,
      )}
      {...props}
    >
      {/* Children stay in the layout and keep the button's intrinsic width;
          only their paint is suppressed. The spinner overlays the same box, so
          the button cannot change size between idle and loading. */}
      <span
        className={cn(
          'inline-flex items-center gap-2',
          loading && 'invisible',
        )}
      >
        {children}
      </span>

      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner size={size === 'sm' ? 14 : 16} />
          <span className="sr-only">{loadingLabel}</span>
        </span>
      )}
    </button>
  )
}
