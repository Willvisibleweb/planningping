// Shared shell for the public planning-application location pages. Light,
// matches the landing page's palette. Server component — no data fetching here.

export default function PlanningApplicationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-[#E5E7EB]">
        <div className="mx-auto max-w-4xl px-6 h-14 flex items-center justify-between">
          <a href="/" className="text-sm font-semibold tracking-tight text-[#111827]">
            Planning<span className="text-[#2563EB]">Ping</span>
          </a>
          <a
            href="/signup"
            className="inline-flex items-center rounded-md bg-[#2563EB] px-3.5 py-1.5 text-sm font-medium text-white hover:bg-[#1D4ED8] transition-colors"
          >
            Get alerts
          </a>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-[#E5E7EB] mt-16">
        <div className="mx-auto max-w-4xl px-6 py-6 text-xs leading-relaxed text-[#9CA3AF]">
          Planning data is collected from public council registers and may be incomplete,
          delayed, or inaccurate. Always verify against the official planning authority
          before acting. {' · '}
          <a href="/" className="hover:text-[#6B7280]">PlanningPing</a>
        </div>
      </footer>
    </div>
  )
}
