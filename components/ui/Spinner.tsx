import { cn } from '@/lib/cn'

// Inline loading indicator. `currentColor` so it inherits whatever it sits in —
// white on a primary button, brand blue on a ghost one, without a variant prop.
//
// The pp-spinner class is deliberately exempted from the global
// prefers-reduced-motion rule in globals.css: a spinner forced to a 0.01ms
// duration reads as a static smear rather than "working". It's kept, just
// slowed. Progress feedback is information, not decoration.
export default function Spinner({
  size = 16,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      className={cn('pp-spinner animate-spin', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
