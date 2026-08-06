import Link from 'next/link'
import { cn } from '@/lib/cn'

// A next/link that looks and behaves like a Button.
//
// Button renders a <button>, which is wrong for anything that navigates: it
// loses middle-click, cmd-click, "open in new tab" and the browser's own
// link affordances. This keeps the anchor semantics and borrows the styling,
// rather than each call site re-typing a forty-class string — which is what
// was happening in four places before this existed.

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md'

const BASE =
  'pp-lift inline-flex items-center justify-center gap-1.5 rounded-sm font-medium whitespace-nowrap ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-standard ' +
  'hover:-translate-y-px active:translate-y-0 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary-500 text-white shadow-sm hover:bg-primary-600 hover:shadow-primary active:bg-primary-700',
  secondary:
    'border border-border bg-surface text-ink shadow-sm hover:border-primary-300 hover:bg-primary-50 hover:shadow-md active:bg-primary-100',
  ghost: 'text-ink-muted hover:bg-neutral-100 hover:text-ink active:bg-neutral-200',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
}

export default function LinkButton({
  href,
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Link>, 'href'> & {
  href: string
  variant?: Variant
  size?: Size
}) {
  return (
    <Link
      href={href}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    >
      {children}
    </Link>
  )
}
