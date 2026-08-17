// The sectors PlanningPing sells to.
//
// One list, used by the onboarding UI and the server action that validates what
// it submits, so the two cannot drift. The codes match the CHECK constraint in
// migration 0025 — adding one here without adding it there produces a write
// that fails at the database, which is the correct place for that to fail.
//
// Codes are stable, labels are not: the wording will change as the market is
// better understood, and a copy edit must never orphan stored rows.

export const SECTORS = [
  {
    code: 'subcontractor',
    label: 'Specialist subcontractor',
    hint: 'Drainage, groundworks, piling, highways, structures',
  },
  {
    code: 'materials',
    label: 'I supply materials',
    hint: 'Products specified into projects before they start on site',
  },
  {
    code: 'general_builder',
    label: 'General builder or main contractor',
    hint: 'Tendering for whole schemes rather than a package',
  },
  {
    code: 'developer',
    label: 'Developer or land scout',
    hint: 'Looking for sites, land and what is coming forward',
  },
  {
    code: 'professional_services',
    label: 'Design or professional services',
    hint: 'Engineering, architecture, surveying, planning consultancy',
  },
] as const

export type SectorCode = (typeof SECTORS)[number]['code'] | 'other'

const KNOWN = new Set<string>([...SECTORS.map((s) => s.code), 'other'])

/** Narrow untrusted input to a storable sector code, or null. */
export function toSectorCode(value: unknown): SectorCode | null {
  return typeof value === 'string' && KNOWN.has(value) ? (value as SectorCode) : null
}

export function sectorLabel(code: string | null): string | null {
  if (!code) return null
  if (code === 'other') return 'Other'
  return SECTORS.find((s) => s.code === code)?.label ?? null
}
