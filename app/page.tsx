import { MapPin, Mail, CheckCircle } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Nav */}
      <header className="border-b border-[#E5E7EB]">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight text-[#111827]">PlanningPing</span>
          <a
            href="/login"
            className="text-sm font-medium text-[#6B7280] hover:text-[#111827] transition-colors"
          >
            Sign in
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex items-center">
        <div className="max-w-5xl mx-auto px-6 py-24 w-full">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-[#2563EB] mb-4 tracking-wide uppercase">
              UK Planning Application Tracker
            </p>
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-[#111827] leading-[1.1] mb-6">
              Know before your<br />neighbours do.
            </h1>
            <p className="text-lg text-[#6B7280] mb-10 leading-relaxed max-w-lg">
              Track planning applications across any UK council area. Get a weekly digest every Monday — new applications, status changes, and decisions in your postcode.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="/signup"
                className="inline-flex items-center px-5 py-2.5 rounded-md bg-[#2563EB] text-sm font-medium text-white hover:bg-[#1D4ED8] transition-colors"
              >
                Get started free
              </a>
              <a
                href="/login"
                className="inline-flex items-center px-5 py-2.5 rounded-md border border-[#E5E7EB] bg-white text-sm font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors"
              >
                Sign in
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-[#E5E7EB] bg-[#F9FAFB]">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div>
              <div className="w-9 h-9 rounded-lg bg-white border border-[#E5E7EB] flex items-center justify-center mb-4 shadow-sm">
                <MapPin size={16} className="text-[#2563EB]" />
              </div>
              <h3 className="text-sm font-semibold text-[#111827] mb-2">Monitor any area</h3>
              <p className="text-sm text-[#6B7280] leading-relaxed">
                Add any UK postcode. We resolve the council automatically and start tracking every planning application in that area.
              </p>
            </div>
            <div>
              <div className="w-9 h-9 rounded-lg bg-white border border-[#E5E7EB] flex items-center justify-center mb-4 shadow-sm">
                <Mail size={16} className="text-[#2563EB]" />
              </div>
              <h3 className="text-sm font-semibold text-[#111827] mb-2">Weekly digests</h3>
              <p className="text-sm text-[#6B7280] leading-relaxed">
                Every Monday morning, get a clean email summary of what&apos;s new — application references, addresses, descriptions, and current status.
              </p>
            </div>
            <div>
              <div className="w-9 h-9 rounded-lg bg-white border border-[#E5E7EB] flex items-center justify-center mb-4 shadow-sm">
                <CheckCircle size={16} className="text-[#2563EB]" />
              </div>
              <h3 className="text-sm font-semibold text-[#111827] mb-2">Never miss a decision</h3>
              <p className="text-sm text-[#6B7280] leading-relaxed">
                Status changes and decisions are flagged the moment we detect them — approved, refused, or pending. No manual checking required.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E5E7EB]">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#111827]">PlanningPing</span>
          <span className="text-xs text-[#9CA3AF]">Track planning. Stay ahead.</span>
        </div>
      </footer>
    </div>
  )
}
