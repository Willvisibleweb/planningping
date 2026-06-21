// Public Privacy Policy page. No auth required (middleware only gates
// /dashboard and /settings). Copy lives in ./content.ts.

import type { Metadata } from 'next'
import PolicyPage from '@/components/legal/PolicyPage'
import { privacyMarkdown } from './content'

export const metadata: Metadata = {
  title: 'Privacy Policy — PlanningPing',
  description: 'PlanningPing Privacy Policy.',
}

export default function PrivacyPage() {
  return <PolicyPage markdown={privacyMarkdown} />
}
