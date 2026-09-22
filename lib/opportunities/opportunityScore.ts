import { positiveSignals } from '@/lib/scoring/civilsCriteria'
import type {
  OpportunityFeedback,
  OpportunityProfile,
  PlanningApplication,
} from '@/types/database'

export type EvidenceKind = 'fact' | 'estimate' | 'insight'
export type MatchLabel = 'Strong Match' | 'Good Match' | 'Possible Match' | 'Low Match'
export type TimingCode =
  | 'monitor'
  | 'build_relationship'
  | 'contact_now'
  | 'urgent'
  | 'low_priority'

export interface OpportunityFactor {
  label: string
  detail?: string
  kind: EvidenceKind
}

export interface OpportunityTiming {
  code: TimingCode
  label: 'MONITOR' | 'BUILD RELATIONSHIP' | 'CONTACT NOW' | 'URGENT' | 'LOW PRIORITY'
  body: string
  kind: EvidenceKind
}

export interface OpportunityScoreResult {
  score: number
  label: MatchLabel
  factors: OpportunityFactor[]
  concerns: OpportunityFactor[]
  timing: OpportunityTiming
  recommendedAction: string
  likelyWork: OpportunityFactor[]
  category: 'for_you' | 'contact_now' | 'monitor' | 'new' | 'updated' | 'dismissed'
}

const PACKAGE_BY_SIGNAL: Record<string, string> = {
  'Drainage / SuDS scope': 'Drainage and SuDS',
  'Earthworks / groundworks scope': 'Groundworks and earthworks',
  'Highways / access scope': 'Roads and access',
  'Structural / retaining scope': 'Structures and retaining works',
  'Flood / water management scope': 'Flood and water management',
  'Infrastructure / enabling works': 'Infrastructure and enabling works',
  'Major development type': 'Major development works',
}

const SERVICE_ALIASES: Record<string, string[]> = {
  groundworks: ['groundwork', 'earthwork', 'foundation', 'external works', 'substructure'],
  civils: ['civil', 'roads', 'highways', 'drainage', 'suds', 'infrastructure'],
  drainage: ['drainage', 'suds', 'surface water', 'foul water'],
  highways: ['highway', 'road', 'access'],
  brickwork: ['brick', 'masonry'],
  roofing: ['roof'],
  mechanical: ['m&e', 'mechanical', 'plant'],
  electrical: ['m&e', 'electrical', 'power'],
  landscaping: ['landscape', 'external works'],
  demolition: ['demolition', 'enabling'],
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.min(Math.max(Math.round(n), min), max)
}

function labelFor(score: number): MatchLabel {
  if (score >= 80) return 'Strong Match'
  if (score >= 65) return 'Good Match'
  if (score >= 45) return 'Possible Match'
  return 'Low Match'
}

function text(app: PlanningApplication): string {
  return `${app.description ?? ''} ${app.address ?? ''} ${app.status ?? ''}`.toLowerCase()
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle.toLowerCase()))
}

function parseResidentialUnits(app: PlanningApplication): number | null {
  const haystack = text(app)
  const re = /(\d{1,4})\s*(?:no\.?\s*)?(?:dwellings?|homes?|houses?|residential\s+units?|apartments?|flats?)\b/gi
  let max: number | null = null
  let match: RegExpExecArray | null
  while ((match = re.exec(haystack)) !== null) {
    const n = Number.parseInt(match[1], 10)
    if (!Number.isNaN(n) && (max === null || n > max)) max = n
  }
  return max
}

function inferSector(app: PlanningApplication): string | null {
  const haystack = text(app)
  if (includesAny(haystack, ['school', 'college', 'university', 'education'])) return 'education'
  if (includesAny(haystack, ['warehouse', 'industrial', 'logistics', 'employment', 'factory'])) return 'industrial'
  if (includesAny(haystack, ['office', 'retail', 'hotel', 'commercial'])) return 'commercial'
  if (includesAny(haystack, ['road', 'highway', 'bridge', 'substation', 'solar', 'battery storage', 'infrastructure'])) return 'infrastructure'
  if (parseResidentialUnits(app) !== null || includesAny(haystack, ['dwelling', 'residential', 'homes', 'apartments', 'flats'])) return 'residential'
  return null
}

function likelyWork(app: PlanningApplication): OpportunityFactor[] {
  return positiveSignals(app.score_reasons).map((signal) => ({
    label: PACKAGE_BY_SIGNAL[signal] ?? signal,
    detail: 'Inferred from planning description keywords.',
    kind: 'estimate' as const,
  }))
}

function profileServices(profile: OpportunityProfile | null): string[] {
  if (!profile) return []
  return [...profile.primary_services, ...profile.secondary_services]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function serviceMatches(profile: OpportunityProfile | null, packages: OpportunityFactor[]): string[] {
  const services = profileServices(profile)
  if (services.length === 0) return []
  const packageText = packages.map((p) => p.label).join(' ').toLowerCase()
  return services.filter((service) => {
    const aliases = SERVICE_ALIASES[service] ?? [service]
    return includesAny(packageText, [service, ...aliases])
  })
}

function timingFor(app: PlanningApplication): OpportunityTiming {
  const status = app.status?.toLowerCase() ?? ''
  const target = app.target_decision_date ? new Date(`${app.target_decision_date}T00:00:00Z`) : null
  const daysToTarget = target ? Math.round((target.getTime() - Date.now()) / 86_400_000) : null

  if (status.includes('withdraw') || status.includes('refus') || status.includes('reject')) {
    return {
      code: 'low_priority',
      label: 'LOW PRIORITY',
      body: 'The source record shows an adverse or withdrawn planning outcome. Keep it for context, but do not treat it as a live approach window.',
      kind: 'fact',
    }
  }

  if (app.decision_date) {
    return {
      code: 'contact_now',
      label: 'CONTACT NOW',
      body: 'A planning decision is recorded. PlanningPing infers this is a good point to check whether the project team is moving toward delivery, without assuming procurement has started.',
      kind: 'insight',
    }
  }

  if (typeof daysToTarget === 'number' && daysToTarget >= 0 && daysToTarget <= 14) {
    return {
      code: 'urgent',
      label: 'URGENT',
      body: 'The target decision date is close. Prioritise checking the authority record and identifying the project team this week.',
      kind: 'insight',
    }
  }

  if (app.target_decision_date) {
    return {
      code: 'build_relationship',
      label: 'BUILD RELATIONSHIP',
      body: 'Planning is active and the authority target date is on file. This is likely early enough to research the team and begin light-touch engagement.',
      kind: 'insight',
    }
  }

  return {
    code: 'monitor',
    label: 'MONITOR',
    body: 'The record appears to be at planning stage with no reliable procurement signal. Track it and review when status or project-team data changes.',
    kind: 'insight',
  }
}

function recommendedActionFor(
  app: PlanningApplication,
  timing: OpportunityTiming,
  packages: OpportunityFactor[],
): string {
  if (timing.code === 'low_priority') {
    return 'Keep this as background intelligence unless a revised application or new project-team signal appears.'
  }
  if (timing.code === 'urgent') {
    return 'Check the council record and identify the applicant or planning agent before the next weekly review.'
  }
  if (timing.code === 'contact_now') {
    return 'Research the known project organisation and make a targeted introduction if the scope still fits.'
  }
  if (timing.code === 'build_relationship') {
    return 'Identify the developer, applicant or planning consultant and begin early relationship-building.'
  }
  if (packages.length > 0) {
    return 'Track the opportunity and monitor for a decision, discharge activity or named project-team updates.'
  }
  return 'Review the source record before deciding whether this should enter your pipeline.'
}

export function calculateOpportunityScore(
  app: PlanningApplication,
  profile: OpportunityProfile | null,
  feedback?: OpportunityFeedback | null,
): OpportunityScoreResult {
  const factors: OpportunityFactor[] = []
  const concerns: OpportunityFactor[] = []
  const packages = likelyWork(app)
  const timing = timingFor(app)
  const units = parseResidentialUnits(app)
  const sector = inferSector(app)
  const matchedServices = serviceMatches(profile, packages)

  let score = clamp(app.score ?? 0, 0, 70)

  if (feedback?.verdict === 'not_relevant') {
    return {
      score: 0,
      label: 'Low Match',
      factors: [{ label: 'You marked this as not relevant', kind: 'fact' }],
      concerns,
      timing,
      recommendedAction: 'No action recommended unless your view changes.',
      likelyWork: packages,
      category: 'dismissed',
    }
  }

  if (profile) {
    factors.push({ label: `Scored for ${profile.name}`, kind: 'fact' })
  } else {
    concerns.push({
      label: 'No company opportunity profile yet',
      detail: 'Add your services and preferred project sizes to improve recommendations.',
      kind: 'fact',
    })
  }

  if (packages.length > 0) {
    factors.push({
      label: `Potential work: ${packages.map((p) => p.label).slice(0, 3).join(', ')}`,
      kind: 'estimate',
    })
  } else {
    concerns.push({
      label: 'No specific work package detected',
      detail: 'The planning description does not expose enough construction scope yet.',
      kind: 'estimate',
    })
    score -= 8
  }

  if (matchedServices.length > 0) {
    score += 18
    factors.push({
      label: `Matches your services: ${matchedServices.slice(0, 3).join(', ')}`,
      kind: 'fact',
    })
  } else if (profileServices(profile).length > 0 && packages.length > 0) {
    score -= 10
    concerns.push({
      label: 'Detected packages do not clearly match your listed services',
      kind: 'estimate',
    })
  }

  if (sector) {
    const prefersSector = profile?.preferred_sectors.includes(sector) ?? false
    if (prefersSector) {
      score += 10
      factors.push({ label: `${sector} project, matching your preferred sectors`, kind: 'estimate' })
    } else if ((profile?.preferred_sectors.length ?? 0) > 0) {
      score -= 6
      concerns.push({ label: `${sector} project outside your preferred sectors`, kind: 'estimate' })
    } else {
      factors.push({ label: `${sector} project type detected`, kind: 'estimate' })
    }
  }

  if (units !== null) {
    factors.push({ label: `${units} residential units detected`, kind: 'estimate' })
    if (profile?.min_residential_units !== null && profile?.min_residential_units !== undefined && units < profile.min_residential_units) {
      score -= 12
      concerns.push({ label: `Below your minimum preferred residential size of ${profile.min_residential_units} units`, kind: 'fact' })
    }
    if (profile?.max_residential_units !== null && profile?.max_residential_units !== undefined && units > profile.max_residential_units) {
      score -= 8
      concerns.push({ label: `Above your maximum preferred residential size of ${profile.max_residential_units} units`, kind: 'fact' })
    }
    if (
      (profile?.min_residential_units === null || profile?.min_residential_units === undefined || units >= profile.min_residential_units) &&
      (profile?.max_residential_units === null || profile?.max_residential_units === undefined || units <= profile.max_residential_units)
    ) {
      score += 8
      if (profile?.min_residential_units || profile?.max_residential_units) {
        factors.push({ label: 'Falls within your preferred residential unit range', kind: 'fact' })
      }
    }
  }

  if (timing.code === 'urgent') score += 10
  else if (timing.code === 'contact_now') score += 8
  else if (timing.code === 'build_relationship') score += 6
  else if (timing.code === 'low_priority') score -= 25

  // When the company prefers to get involved (asked at onboarding and in
  // settings). Small nudges either way: timing is inferred from the record,
  // so it should reorder close calls rather than bury a good fit.
  const preferredStages = profile?.preferred_stages ?? []
  if (preferredStages.length > 0 && timing.code !== 'low_priority') {
    if (preferredStages.includes(timing.code)) {
      score += 6
      factors.push({ label: 'At the stage you prefer to get involved', kind: 'insight' })
    } else {
      score -= 4
      concerns.push({ label: 'Not at the stage you usually get involved', kind: 'insight' })
    }
  }

  factors.push({ label: `Opportunity timing: ${timing.label}`, detail: timing.body, kind: timing.kind })

  if (feedback?.verdict === 'good') {
    score += 6
    factors.push({ label: 'You previously marked this as a good opportunity', kind: 'fact' })
  }

  const finalScore = clamp(score)
  const category =
    timing.code === 'contact_now' || timing.code === 'urgent'
      ? 'contact_now'
      : finalScore >= 65
        ? 'for_you'
        : 'monitor'

  return {
    score: finalScore,
    label: labelFor(finalScore),
    factors: factors.slice(0, 6),
    concerns: concerns.slice(0, 4),
    timing,
    recommendedAction: recommendedActionFor(app, timing, packages),
    likelyWork: packages,
    category,
  }
}
