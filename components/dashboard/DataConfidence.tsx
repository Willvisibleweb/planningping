// "Data quality" on an application — where the record came from, when it was
// last checked, and which of a fixed set of checks it passes.
//
// Server component: the assessment is computed from the row on the server and
// the breakdown uses a native <details>, so this adds no client JavaScript.
// The score is labelled as checks, not accuracy — see lib/reliability/dataQuality.

import { AlertTriangle, Check, ExternalLink, Info, X } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import type { QualityAssessment, QualityCheck } from '@/lib/reliability/dataQuality'
import type { ApplicationChange } from '@/types/database'

const LEVEL_TONE = { High: 'success', Medium: 'warning', Low: 'danger' } as const

const FIELD_LABEL: Record<ApplicationChange['field'], string> = {
  status: 'Status',
  decision_date: 'Decision date',
  description: 'Description',
  address: 'Address',
  agent_company: 'Agent',
  target_decision_date: 'Decision due',
  application_date: 'Submitted',
  app_type: 'Application type',
  source_url: 'Source link',
}

function Mark({ status }: { status: QualityCheck['status'] }) {
  if (status === 'pass') return <Check size={14} className="mt-0.5 shrink-0 text-success-600" aria-label="Passed" />
  if (status === 'warn') return <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning-600" aria-label="Warning" />
  if (status === 'fail') return <X size={14} className="mt-0.5 shrink-0 text-danger-600" aria-label="Failed" />
  return <Info size={14} className="mt-0.5 shrink-0 text-ink-muted" aria-label="Information" />
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }).format(new Date(iso))
}

function clip(value: string | null): string {
  if (!value) return 'not recorded'
  return value.length > 60 ? `${value.slice(0, 57)}…` : value
}

export default function DataConfidence({
  assessment,
  sourceUrl,
  changes,
}: {
  assessment: QualityAssessment
  sourceUrl: string | null
  changes: ApplicationChange[]
}) {
  // The headline shows what matters at a glance: the source link, freshness
  // and anything that failed. The full, weighted list is one click away.
  const headline = assessment.checks.filter(
    (c) => c.id === 'source_link' || c.id === 'reference' || c.id === 'freshness' || c.status === 'fail',
  ).slice(0, 5)

  return (
    <section className="rounded-md border border-border bg-surface p-4 shadow-sm sm:p-5" aria-labelledby="data-quality-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="data-quality-heading" className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Data quality</p>
        <div className="flex items-center gap-2">
          <Badge tone={LEVEL_TONE[assessment.level]}>{assessment.level}</Badge>
          <span className="tabular-data text-xs text-ink-muted">{assessment.score}/100</span>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {headline.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-sm text-ink">
            <Mark status={c.status} />
            <span>{c.label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="pp-link inline-flex items-center gap-1.5 text-xs font-medium">
            View original source <ExternalLink size={13} aria-hidden="true" />
          </a>
        ) : (
          <span className="text-xs text-ink-muted">No link to the original record is held.</span>
        )}
      </div>

      <details className="group mt-3 border-t border-border pt-3">
        <summary className="cursor-pointer text-xs font-medium text-ink-muted hover:text-ink">How this is calculated</summary>
        <ul className="mt-3 space-y-1.5">
          {assessment.checks.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 text-xs">
              <span className="flex items-start gap-2 text-ink">
                <Mark status={c.status} />
                <span>
                  {c.label}
                  {c.detail && c.id !== 'reference' && c.id !== 'status' && c.id !== 'authority' ? <span className="block text-ink-muted">{c.detail}</span> : null}
                </span>
              </span>
              <span className="tabular-data shrink-0 text-ink-muted">{c.status === 'info' ? 'not scored' : `${c.earned}/${c.weight}`}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-2xs leading-relaxed text-ink-muted">{assessment.basis}</p>
      </details>

      {changes.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Record history</p>
          <ul className="mt-2 space-y-1.5">
            {changes.map((c) => (
              <li key={c.id} className="text-xs text-ink">
                <span className="text-ink-muted">{shortDate(c.detected_at)} · </span>
                {FIELD_LABEL[c.field]}: {c.field === 'description' ? 'revised by the authority' : `${clip(c.old_value)} → ${clip(c.new_value)}`}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-2xs text-ink-muted">Changes seen in the source since PlanningPing began tracking them.</p>
        </div>
      )}
    </section>
  )
}
