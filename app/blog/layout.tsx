// Shared shell for the public blog (index + articles). Mirrors
// app/planning-applications/layout.tsx's shell exactly. Server component —
// no data fetching here.

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <header className="border-b border-border">
        <div className="mx-auto max-w-4xl px-6 h-14 flex items-center justify-between">
          <a href="/" className="text-sm font-semibold tracking-tight text-ink">
            Planning<span className="text-primary-500">Ping</span>
          </a>
          <a
            href="/signup"
            className="inline-flex items-center rounded-md bg-primary-500 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
          >
            Get alerts
          </a>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border mt-16">
        <div className="mx-auto max-w-4xl px-6 py-6 text-xs leading-relaxed text-neutral-500">
          <a href="/" className="hover:text-ink-muted">PlanningPing</a>
        </div>
      </footer>
    </div>
  )
}
