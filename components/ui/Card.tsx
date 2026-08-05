import { cn } from '@/lib/cn'

// Panels and cards. Padding is deliberately generous — the old cards sat at
// p-3/p-3.5, which is what made dense planning data read as cramped.
//
// `interactive` is for cards that are themselves a link or button target; it
// adds the same lift the buttons use. Static cards don't move on hover, because
// a card that lifts when you're only reading it is noise.

export function Card({
  className,
  interactive = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-md border border-border bg-surface shadow-sm',
        interactive &&
          'pp-lift transition-[box-shadow,transform,border-color] duration-fast ease-standard ' +
            'hover:-translate-y-px hover:border-primary-300 hover:shadow-md',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6 sm:py-5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-sm font-semibold text-ink', className)} {...props}>
      {children}
    </h3>
  )
}

export function CardDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('mt-1 text-xs text-ink-muted', className)} {...props}>
      {children}
    </p>
  )
}

export function CardBody({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 py-5 sm:px-6 sm:py-6', className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 border-t border-border bg-surface-sunken px-5 py-4 sm:px-6',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
