import { cn } from '@/lib/cn'

// Skeletons are shaped like the content they stand in for, not centred
// spinners — the page should hold its final layout while it loads so nothing
// jumps when the data lands.
//
// The shimmer is a masked sweep rather than a pulse: animate-pulse blinks the
// whole block to 50% opacity, which reads as flashing on a page full of them.

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-sm bg-neutral-200/70',
        'after:absolute after:inset-0 after:-translate-x-full',
        'after:bg-gradient-to-r after:from-transparent after:via-white/55 after:to-transparent',
        'after:animate-[pp-shimmer_1.6s_infinite]',
        className,
      )}
      {...props}
    />
  )
}

/** A run of text lines, last one short, the way a paragraph actually ends. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3', i === lines - 1 ? 'w-2/5' : 'w-full')}
        />
      ))}
    </div>
  )
}

/** Matches the stat tiles on the dashboard: label, figure, sub-label. */
export function SkeletonStatTile() {
  return (
    <div className="rounded-md border border-border bg-surface p-5 shadow-sm">
      <Skeleton className="h-2.5 w-20" />
      <Skeleton className="mt-3 h-7 w-14" />
      <Skeleton className="mt-2.5 h-2.5 w-28" />
    </div>
  )
}

/** Matches an ApplicationRow: reference + date, description, address, pill. */
export function SkeletonRow() {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-2.5 w-16" />
        </div>
        <Skeleton className="mt-2.5 h-3 w-4/5" />
        <Skeleton className="mt-2 h-2.5 w-1/3" />
      </div>
      <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
    </div>
  )
}

/** A card with a header and a run of rows — the territory/leads list shape. */
export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-md border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-5 py-4 sm:px-6 sm:py-5">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="mt-2 h-2.5 w-56" />
      </div>
      <div className="divide-y divide-border px-5 sm:px-6">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  )
}
