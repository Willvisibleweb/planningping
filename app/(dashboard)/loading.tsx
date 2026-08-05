// Shown while any dashboard route's server component is fetching. Shaped like
// the territory view — the busiest of them — so the page holds its layout
// while data lands instead of collapsing to a spinner and jumping back.

import { Skeleton, SkeletonStatTile, SkeletonCard } from '@/components/ui/Skeleton'

export default function DashboardLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your dashboard…</span>

      <div>
        <Skeleton className="h-5 w-44" />
        <Skeleton className="mt-2.5 h-3 w-full max-w-lg" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SkeletonStatTile />
        <SkeletonStatTile />
        <SkeletonStatTile />
        <SkeletonStatTile />
      </div>

      <div className="rounded-md border border-border bg-surface p-6 shadow-sm">
        <Skeleton className="h-3.5 w-48" />
        <div className="mt-5 flex flex-col gap-4 sm:flex-row">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-32 shrink-0" />
        </div>
      </div>

      <div className="space-y-4">
        <SkeletonCard rows={3} />
        <SkeletonCard rows={2} />
      </div>
    </div>
  )
}
