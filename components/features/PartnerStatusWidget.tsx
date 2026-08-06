// Partner status strip on the dashboard. Server component — it renders nothing
// at all for a non-partner, so the standard dashboard is byte-for-byte
// unchanged rather than carrying hidden partner markup.

import Link from 'next/link'
import { Video, ArrowUpRight } from 'lucide-react'
import { PARTNER_META, type UserFeatures } from '@/lib/features'

export default function PartnerStatusWidget({
  features,
  hubId,
}: {
  features: UserFeatures
  hubId: string | null
}) {
  if (!features.partnerWidget || !features.partnershipProvider) return null

  const meta = PARTNER_META[features.partnershipProvider]

  return (
    <section
      aria-label={`${meta.name} partner status`}
      className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-primary-50 p-5 shadow-sm"
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-sm bg-surface text-primary-600 shadow-sm">
        <Video size={18} aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{meta.name} partner</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
          Site monitoring options appear on every application you open.
          {hubId ? (
            <>
              {' '}
              Hub ID <span className="tabular-data text-ink">{hubId}</span>.
            </>
          ) : (
            ' Add your Hub ID in Settings so enquiries reach the right account.'
          )}
        </p>
      </div>

      <a
        href={meta.hubUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="pp-lift inline-flex h-9 shrink-0 items-center gap-1.5 rounded-sm border border-border bg-surface px-3.5 text-sm font-medium text-ink shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:border-primary-300 hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
      >
        Open {meta.name} Hub
        <ArrowUpRight size={14} className="shrink-0" aria-hidden="true" />
      </a>

      {!hubId && (
        <Link
          href="/settings"
          className="pp-link shrink-0 text-xs font-medium"
        >
          Add Hub ID
        </Link>
      )}
    </section>
  )
}
