import { cn } from '@/lib/cn'

// A selected/unselected pill toggle. Used by the relevance-band filter, the
// outreach mode switch and the outreach angle picker — three places that had
// grown three near-identical copies of the same class string, which is how the
// codebase ended up with seven radii and ten pale blues in the first place.
//
// Renders a real <button> with aria-pressed, so it announces its state instead
// of just looking different.
export default function Pill({
  selected,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium',
        'transition-[background-color,border-color,color,box-shadow] duration-fast ease-standard',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2',
        'disabled:opacity-50',
        selected
          ? 'border-primary-500 bg-primary-500 text-white shadow-sm'
          : 'border-border bg-surface text-ink-muted hover:border-primary-300 hover:bg-primary-50 hover:text-ink',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
