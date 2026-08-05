// Design-system preview — a review surface for the UI primitives, not a
// product page.
//
// Hard-gated to development: in a production build this route 404s, so it
// cannot be reached on planningping.com even if someone guesses the URL.
// Safe to delete once the redesign is signed off; nothing imports from it.

import { notFound } from 'next/navigation'
import PreviewClient from './PreviewClient'

export const metadata = { robots: { index: false, follow: false } }

export default function UiPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <PreviewClient />
}
