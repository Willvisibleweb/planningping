import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PlanningPing — UK Planning Application Alerts',
  description: 'Track UK planning applications in your area and get weekly email digests of new applications and status changes.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.className} h-full antialiased`}>
      <body className="min-h-full bg-white text-[#111827]">{children}</body>
    </html>
  )
}
