import { CheckCircle2, XCircle, Clock, CircleDot, type LucideIcon } from 'lucide-react'

// Status → colour + icon, matching the digest email and landing page. Keyword
// matching keeps it robust across councils' wording ("Approved", "Granted",
// "Refused", "Pending consideration", "Awaiting decision", etc.). Shared
// between TrackedAreasList and the territory detail page so status pills look
// identical everywhere.
export function statusStyle(status: string | null): { cls: string; Icon: LucideIcon } {
  const s = (status ?? '').toLowerCase()
  if (/approv|grant|permit/.test(s)) return { cls: 'bg-[#ECFDF5] text-[#047857]', Icon: CheckCircle2 }
  if (/refus|reject|withdraw|dismiss/.test(s)) return { cls: 'bg-[#FEF2F2] text-[#B91C1C]', Icon: XCircle }
  if (/pending|await|consult|valid|registered/.test(s)) return { cls: 'bg-[#FFFBEB] text-[#B45309]', Icon: Clock }
  return { cls: 'bg-gray-100 text-gray-600', Icon: CircleDot }
}
