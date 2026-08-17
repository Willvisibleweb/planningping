// Says out loud when the data has stopped arriving.
//
// Both times the ingest died, the product did not look broken — it looked
// quiet. Empty lists and old dates read as "not much happening in planning this
// week", which is a completely reasonable thing for a user to conclude and
// exactly the wrong one. Twelve days of silence went unnoticed across the two
// incidents because nothing on screen distinguished "no new applications" from
// "no new anything".
//
// Rendered from the dashboard, which does not depend on the scheduler that
// fails. The health endpoint covers the case where nobody is logged in.

import { AlertTriangle } from 'lucide-react'
import { STALE_AFTER_HOURS, type IngestFreshness } from '@/lib/health/ingestFreshness'

export default function StaleDataNotice({ health }: { health: IngestFreshness }) {
  if (!health.stale) return null

  const { hoursSinceFetch, staleAreas, totalAreas } = health
  const days = hoursSinceFetch !== null ? Math.floor(hoursSinceFetch / 24) : null

  const age =
    hoursSinceFetch === null
      ? 'has never run'
      : days && days >= 1
        ? `last ran ${days} ${days === 1 ? 'day' : 'days'} ago`
        : `last ran ${hoursSinceFetch} hours ago`

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-md border border-warning-200 bg-warning-50 px-4 py-3"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning-600" aria-hidden="true" />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-warning-700">
          This page may be out of date
        </p>
        <p className="mt-0.5 leading-relaxed text-warning-700/90">
          {/* Names the number rather than saying "recently": the difference
              between two days and two weeks changes what the reader should do,
              and vagueness here is what let the last outage run for over a
              week. */}
          Our check for new applications {age}
          {staleAreas < totalAreas
            ? ` for ${staleAreas} of your ${totalAreas} territories`
            : ''}
          , so anything published since then won&rsquo;t be here yet. Nothing is
          lost — applications appear as soon as it runs again.
        </p>
      </div>
    </div>
  )
}

// Threshold re-exported for tests and for anything rendering its own copy of
// this warning, so the number lives in exactly one place.
export { STALE_AFTER_HOURS }
