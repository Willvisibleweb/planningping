import type { Digest } from '@/types/database'

export default function DigestHistory({ digests }: { digests: Digest[] }) {
  return (
    <div className="rounded-lg border border-[#D6E4FB] bg-white p-5">
      <h3 className="text-sm font-medium text-[#202124] mb-4">Digest history</h3>
      {digests.length === 0 ? (
        <p className="text-sm text-[#A0A1A6]">No digests sent yet.</p>
      ) : (
        <div className="divide-y divide-[#E9F0FD]">
          {digests.map((digest) => (
            <div key={digest.id} className="py-2 flex items-center justify-between">
              <div>
                <p className="text-sm text-[#202124]">
                  {digest.application_count} application{digest.application_count !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-[#A0A1A6]">
                  {digest.period_start} → {digest.period_end}
                </p>
              </div>
              <p className="text-xs text-[#A0A1A6]">
                {new Date(digest.sent_at).toLocaleDateString('en-GB')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
