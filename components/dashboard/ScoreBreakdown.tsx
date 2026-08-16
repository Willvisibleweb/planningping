// Why an application scored what it scored.
//
// The brief's point stands: a number nobody understands is not trusted, and a
// director asked to chase a lead will want to know what the machine saw. The
// scorer already explains itself — reasons are stored as "Drainage / SuDS scope
// (+25)" — so this parses the points back out and shows them as rows that add
// up to the total.
//
// The case that most needed explaining: an exclusion forces the band to COLD
// regardless of score (FORCE_COLD_ON_EXCLUSION in scoreApplication). There is a
// live application scoring 95 and banded COLD while an 88 is HOT. Without a
// sentence saying so, that reads as a bug and costs trust in every other score.

import Badge from '@/components/ui/Badge'

interface Factor {
  label: string
  points: number | null
}

// "Drainage / SuDS scope (+25)"                  → { Drainage / SuDS scope, +25 }
// "Large scheme (100+ units): 212 units (+30)"   → { ...: 212 units, +30 }
// Anchored to the end so the inner parentheses in the second form survive.
function parseFactor(reason: string): Factor {
  const m = reason.match(/^(.*?)\s*\(([+-]\d+)\)\s*$/)
  if (!m) return { label: reason, points: null }
  return { label: m[1]!.trim(), points: Number(m[2]) }
}

const BAND_TONE = { HOT: 'danger', WARM: 'warning', COLD: 'neutral' } as const

export default function ScoreBreakdown({
  score,
  band,
  reasons,
  scoreAtAdd,
}: {
  score: number | null
  band: 'HOT' | 'WARM' | 'COLD' | null
  reasons: string[] | null
  /** The score when this lead was added, if it differs from the live one. */
  scoreAtAdd?: number | null
}) {
  const factors = (reasons ?? []).map(parseFactor)
  const negatives = factors.filter((f) => (f.points ?? 0) < 0)

  // The band and the arithmetic disagree whenever an exclusion is present.
  // Saying so plainly is the whole point of this component.
  const forcedCold = band === 'COLD' && negatives.length > 0 && (score ?? 0) >= 40

  const drifted =
    typeof scoreAtAdd === 'number' && typeof score === 'number' && scoreAtAdd !== score

  if (score === null && factors.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Not scored yet. Scoring runs when an application is first ingested or its
        details change.
      </p>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="tabular-data text-3xl font-semibold text-ink">{score ?? 0}</span>
        {band && (
          <Badge tone={BAND_TONE[band]} className="font-semibold">
            {band}
          </Badge>
        )}
        {drifted && (
          <span className="text-xs text-ink-muted">
            was <span className="tabular-data">{scoreAtAdd}</span> when you added it
          </span>
        )}
      </div>

      {forcedCold && (
        <p className="mt-3 rounded-sm bg-warning-50 px-3 py-2 text-xs leading-relaxed text-warning-700 ring-1 ring-inset ring-warning-200">
          Scored {score}, but held at COLD because this is a consent type that
          rarely carries civils scope — see the negative factor below. The number
          reflects the words in the description; the band reflects what the
          application actually is.
        </p>
      )}

      {factors.length > 0 && (
        <dl className="mt-4 divide-y divide-border border-t border-border">
          {factors.map((f, i) => (
            <div key={i} className="flex items-baseline justify-between gap-4 py-2">
              <dt className="min-w-0 text-sm leading-relaxed text-ink">{f.label}</dt>
              <dd
                className={`tabular-data shrink-0 text-sm font-medium ${
                  f.points === null
                    ? 'text-ink-muted'
                    : f.points < 0
                      ? 'text-danger-600'
                      : 'text-success-600'
                }`}
              >
                {f.points === null ? '—' : f.points > 0 ? `+${f.points}` : f.points}
              </dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 border-t border-border-strong py-2">
            <dt className="text-sm font-semibold text-ink">Total</dt>
            <dd className="tabular-data text-sm font-semibold text-ink">{score ?? 0}</dd>
          </div>
        </dl>
      )}

      {drifted && (
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          Applications are re-scored when their details change or the rules are
          updated, so this can move after you add a lead. The figure above is
          current.
        </p>
      )}
    </div>
  )
}
