export const SERVICE_OPTIONS = [
  { value: 'groundworks', label: 'Groundworks' },
  { value: 'civils', label: 'Civil engineering' },
  { value: 'drainage', label: 'Drainage' },
  { value: 'highways', label: 'Roads / highways' },
  { value: 'brickwork', label: 'Brickwork' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'demolition', label: 'Demolition / enabling' },
] as const

export const SECTOR_OPTIONS = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'industrial', label: 'Industrial / logistics' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'education', label: 'Education' },
] as const

export const STAGE_OPTIONS = [
  { value: 'monitor', label: 'Monitor' },
  { value: 'build_relationship', label: 'Build relationship' },
  { value: 'contact_now', label: 'Contact now' },
  { value: 'urgent', label: 'Urgent' },
] as const

// Onboarding asks the same questions as the settings form, in friendlier
// terms, and writes the same opportunity profile — so settings open pre-filled
// with whatever was answered at signup.

export const SIZE_PRESETS = [
  { value: 'any', label: 'Any size', hint: 'Show me everything', min: null, max: null },
  { value: 'small', label: 'Small schemes', hint: '1–9 homes', min: 1, max: 9 },
  { value: 'medium', label: 'Medium schemes', hint: '10–49 homes', min: 10, max: 49 },
  { value: 'large', label: 'Large schemes', hint: '50+ homes', min: 50, max: null },
] as const

export type SizePreset = (typeof SIZE_PRESETS)[number]['value']

export function sizePresetFor(min: number | null, max: number | null): SizePreset {
  return SIZE_PRESETS.find((p) => p.min === min && p.max === max)?.value ?? 'any'
}

// Plain-language timing choices, each mapped onto the scoring engine's stage
// codes (see timingFor in opportunityScore.ts).
export const TIMING_CHOICES = [
  { value: 'early', label: 'Early, while it is still in planning', hint: 'Time to build a relationship before anyone is appointed', stages: ['monitor', 'build_relationship'] },
  { value: 'deadline', label: 'When a decision is due soon', hint: 'The council’s target date is within two weeks', stages: ['urgent'] },
  { value: 'approved', label: 'Once it has been approved', hint: 'Consent granted — the project may be moving toward delivery', stages: ['contact_now'] },
] as const

export type TimingChoice = (typeof TIMING_CHOICES)[number]['value']

export function timingChoicesFor(stages: string[]): TimingChoice[] {
  return TIMING_CHOICES.filter((c) => c.stages.some((s) => stages.includes(s))).map((c) => c.value)
}

export const ALERT_CHOICES = [
  { value: 'HOT_ONLY', label: 'Only strong matches', hint: 'Fewest emails' },
  { value: 'WARM_PLUS', label: 'Strong matches and ones worth reviewing', hint: 'Recommended' },
  { value: 'ALL', label: 'Every new application', hint: 'Most emails' },
  { value: 'OFF', label: 'No emails for now', hint: 'Check the dashboard instead' },
] as const

export type AlertChoice = (typeof ALERT_CHOICES)[number]['value']
