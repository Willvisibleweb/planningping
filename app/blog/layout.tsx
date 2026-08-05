// Shared shell for the public blog (index + articles). Mirrors
// app/planning-applications/layout.tsx's shell exactly. Server component —
// no data fetching here.

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <header className="border-b border-border">
        <div className="mx-auto max-w-4xl px-6 h-14 flex items-center justify-between">
          <a
            href="/"
            className="rounded-sm text-sm font-semibold tracking-tight text-ink transition-colors duration-fast ease-standard hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
          >
            Planning<span className="text-primary-500">Ping</span>
          </a>
          <a
            href="/signup"
            className="pp-lift inline-flex items-center rounded-sm bg-primary-500 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-[background-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:bg-primary-600 hover:shadow-primary active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
          >
            Get alerts
          </a>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border mt-16">
        <div className="mx-auto max-w-4xl px-6 py-6 text-xs leading-relaxed text-neutral-500">
          <a href="/" className="pp-link-muted">PlanningPing</a>
        </div>
      </footer>
    </div>
  )
}
