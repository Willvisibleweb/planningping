import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

// Resolves all relative URLs Next.js generates for metadata (canonical tags,
// Open Graph images, etc.) against an absolute base. Falls back to the real
// production domain, not the old *.vercel.app one — safe even if the
// NEXT_PUBLIC_SITE_URL env var is ever missing or stale.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://planningping.com'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'PlanningPing — UK Planning Application Alerts',
  description: 'Track UK planning applications in your area and get alerted to new applications and status changes.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.className} h-full antialiased`}>
      <body className="min-h-full bg-white text-[#111827]">{children}</body>
    </html>
  )
}
