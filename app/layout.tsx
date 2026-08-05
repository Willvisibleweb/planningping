import type { Metadata } from 'next'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import { ToastProvider } from '@/components/ui/Toast'
import './globals.css'

// IBM Plex Sans is a variable font, so no weight list is needed — the whole
// 100–700 range comes down in one file and every weight in the type scale is
// available. Exposed as a CSS variable rather than a className so globals.css
// can build --font-sans on top of it.
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plex-sans',
})

// Plex Mono has no variable cut, so the weights have to be listed explicitly.
// Three is all the interface uses: 400 for reference numbers and dates, 500
// for emphasised data, 600 for figures in stat tiles.
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
})

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
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} h-full`}>
      <body className="min-h-full bg-surface font-sans text-ink antialiased">
        {/* Client provider rendered from a server component — children stay
            server-rendered, so this costs no page a server/client boundary it
            didn't already have. Mounted at the root so any route can confirm a
            mutation without wiring up its own provider. */}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
