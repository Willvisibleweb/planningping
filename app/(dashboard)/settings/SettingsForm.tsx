// Digest info — static for now. The scraper + digest run every Monday at 6am,
// so offering a day picker would be a promise the workflow doesn't keep. The
// profiles.digest_day column stays in the DB for when per-day scheduling is
// actually built; reintroduce the selector (and the updateSettings action) then.

export default function SettingsForm() {
  return (
    <div className="rounded-lg border border-[#D6E4FB] bg-white p-5">
      <h3 className="text-sm font-medium text-[#202124] mb-2">Weekly digest</h3>
      <p className="text-sm text-[#6B6C70]">
        Your digest arrives every <span className="font-medium text-[#202124]">Monday morning</span>,
        covering the previous week&rsquo;s new applications for your tracked areas.
      </p>
      <p className="mt-2 text-xs text-[#A0A1A6]">
        Choosing your own digest day is coming later.
      </p>
    </div>
  )
}
