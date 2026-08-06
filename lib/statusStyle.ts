import { CheckCircle2, XCircle, Clock, CircleDot, type LucideIcon } from 'lucide-react'

// Status → semantic tone + icon, matching the digest email and landing page.
// Keyword matching keeps it robust across councils' wording ("Approved",
// "Granted", "Refused", "Pending consideration", "Awaiting decision", etc.).
// Shared between TrackedAreasList and the territory detail page so status pills
// look identical everywhere.
//
// Returns a Badge tone rather than a class string: the pill styling now lives
// in one place (components/ui/Badge) instead of being half here and half at
// each call site, which is how the fallback ended up on Tailwind's default
// greys while the other three used hand-picked hexes.
export type StatusTone = 'success' | 'danger' | 'warning' | 'neutral'

export function statusStyle(status: string | null): { tone: StatusTone; Icon: LucideIcon } {
  const s = (status ?? '').toLowerCase()
  if (/approv|grant|permit/.test(s)) return { tone: 'success', Icon: CheckCircle2 }
  if (/refus|reject|withdraw|dismiss/.test(s)) return { tone: 'danger', Icon: XCircle }
  if (/pending|await|consult|valid|registered/.test(s)) return { tone: 'warning', Icon: Clock }
  return { tone: 'neutral', Icon: CircleDot }
}
