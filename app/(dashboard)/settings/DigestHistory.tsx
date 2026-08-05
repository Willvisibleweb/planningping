import { Mail } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import type { Digest } from '@/types/database'

export default function DigestHistory({ digests }: { digests: Digest[] }) {
  return (
    <div className="rounded-md border border-border bg-surface p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-ink">Digest history</h3>
      {digests.length === 0 ? (
        <EmptyState
          size="sm"
          icon={Mail}
          title="No digests sent yet"
          description="Your first weekly digest goes out on Monday morning, listing every new application in your tracked territories."
        />
      ) : (
        <div className="divide-y divide-border">
          {digests.map((digest) => (
            <div key={digest.id} className="-mx-2 flex items-center justify-between rounded-sm px-2 py-3 transition-colors duration-fast ease-standard hover:bg-primary-50/60">
              <div>
                <p className="text-sm text-ink">
                  {digest.application_count} application{digest.application_count !== 1 ? 's' : ''}
                </p>
                <p className="tabular-data text-xs text-ink-muted">
                  {digest.period_start} → {digest.period_end}
                </p>
              </div>
              <p className="tabular-data text-xs text-ink-muted">
                {new Date(digest.sent_at).toLocaleDateString('en-GB')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
