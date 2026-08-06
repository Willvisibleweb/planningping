import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-surface-sunken">
      <header className="border-b border-border bg-surface">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center">
          <Link
            href="/"
            className="rounded-sm text-sm font-semibold tracking-tight text-ink transition-colors duration-fast ease-standard hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
          >
            Planning<span className="text-primary-500">Ping</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        {children}
      </main>
    </div>
  )
}
