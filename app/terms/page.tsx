// Public Terms of Service page. No auth required (middleware only gates
// /dashboard and /settings). Copy lives in ./content.ts.

import type { Metadata } from 'next'
import PolicyPage from '@/components/legal/PolicyPage'
import { termsMarkdown } from './content'

export const metadata: Metadata = {
  title: 'Terms of Service — PlanningPing',
  description: 'PlanningPing Terms of Service.',
}

export default function TermsPage() {
  return <PolicyPage markdown={termsMarkdown} />
}
