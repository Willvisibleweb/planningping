// Digest info — static for now. The scraper + digest run every Monday at 6am,
// so offering a day picker would be a promise the workflow doesn't keep. The
// profiles.digest_day column stays in the DB for when per-day scheduling is
// actually built; reintroduce the selector (and the updateSettings action) then.

export default function SettingsForm() {
  return (
    <div className="rounded-md border border-border bg-surface p-6 shadow-sm">
      <h3 className="text-sm font-medium text-ink mb-2">Weekly digest</h3>
      <p className="text-sm text-ink-muted">
        Your digest arrives every <span className="font-medium text-ink">Monday morning</span>,
        covering the previous week&rsquo;s new applications for your tracked areas.
      </p>
      <p className="mt-2 text-xs text-ink-muted">
        Choosing your own digest day is coming later.
      </p>
    </div>
  )
}
