// The commercial verdict on an opportunity, in the product's own words.
//
// The scoring engine speaks in HOT / WARM / COLD, which is lead-generation
// language: it tells you how excited to be, not what to do. A BD manager
// deciding where the team spends Tuesday needs the second thing, so the same
// three bands are surfaced as the three decisions they actually stand for:
//
//   HOT   → Strong match      pursue it
//   WARM  → Worth reviewing   someone should qualify this
//   COLD  → Low priority      it matched, but leave it
//
// The bands themselves are untouched — this is a vocabulary layer over
// lib/scoring, not a second scoring system. Anything that changes what the
// numbers mean belongs in the engine, not here.

import Badge from '@/components/ui/Badge'

export type Band = 'HOT' | 'WARM' | 'COLD'

export const BAND_LABEL: Record<Band, string> = {
  HOT: 'Strong match',
  WARM: 'Worth reviewing',
  COLD: 'Low priority',
}

export const BAND_TONE = {
  HOT: 'danger',
  WARM: 'warning',
  COLD: 'neutral',
} as const

// Ordering for anything that groups opportunities by priority. Explicit rather
// than derived from the object key order, which is not something to rely on.
export const BAND_ORDER: Band[] = ['HOT', 'WARM', 'COLD']

/**
 * A score with the decision it implies.
 *
 * `showNumber` is off by default: in a dense list the word is what gets read,
 * and a column of near-identical two-digit numbers is noise. The number earns
 * its place where a single opportunity is the subject — a detail page, a panel
 * header — and where the breakdown that justifies it is nearby.
 */
export default function FitScore({
  score,
  band,
  showNumber = false,
  className,
}: {
  score: number | null
  band: Band | null
  showNumber?: boolean
  className?: string
}) {
  // Unscored is a real state, not a zero: applications are scored on ingest, so
  // anything unscored arrived before the scorer or failed it. Saying "not
  // scored" is honest; showing 0 would rank it below a genuine 0.
  if (!band) {
    return (
      <Badge tone="neutral" className={className}>
        Not scored
      </Badge>
    )
  }

  return (
    <Badge tone={BAND_TONE[band]} className={className}>
      {showNumber && score !== null && (
        <span className="tabular-data font-semibold">{score}</span>
      )}
      {BAND_LABEL[band]}
    </Badge>
  )
}
