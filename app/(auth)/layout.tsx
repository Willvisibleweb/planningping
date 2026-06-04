export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#F9FAFB]">
      <header className="border-b border-[#E5E7EB] bg-white">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center">
          <a
            href="/"
            className="text-sm font-semibold tracking-tight text-[#111827] hover:text-[#2563EB] transition-colors"
          >
            PlanningPing
          </a>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        {children}
      </main>
    </div>
  )
}
