import type { Digest } from '@/types/database'

export default function DigestHistory({ digests }: { digests: Digest[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-medium text-gray-900 mb-4">Digest history</h3>
      {digests.length === 0 ? (
        <p className="text-sm text-gray-400">No digests sent yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {digests.map((digest) => (
            <div key={digest.id} className="py-2 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-800">
                  {digest.application_count} application{digest.application_count !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-gray-400">
                  {digest.period_start} → {digest.period_end}
                </p>
              </div>
              <p className="text-xs text-gray-400">
                {new Date(digest.sent_at).toLocaleDateString('en-GB')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
