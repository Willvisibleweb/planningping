// Opportunity intelligence is deliberately deterministic. It translates
// existing source fields and the existing civils score into sales-oriented
// language, but never claims that an inferred package or timing signal is a
// council fact.

import { positiveSignals } from '@/lib/scoring/civilsCriteria'
import type { PlanningApplication } from '@/types/database'

export interface LikelyWorkPackage {
  label: string
  matchedSignal: string
}

const PACKAGE_BY_SIGNAL: Record<string, string> = {
  'Drainage / SuDS scope': 'Drainage & SuDS',
  'Earthworks / groundworks scope': 'Groundworks & earthworks',
  'Highways / access scope': 'Roads & access',
  'Structural / retaining scope': 'Structures & retaining works',
  'Flood / water management scope': 'Flood & water management',
  'Infrastructure / enabling works': 'Infrastructure & enabling works',
  'Major development type': 'Major development works',
}

export function likelyWorkPackages(reasons: string[] | null): LikelyWorkPackage[] {
  return positiveSignals(reasons)
    .map((signal) => ({ label: PACKAGE_BY_SIGNAL[signal], matchedSignal: signal }))
    .filter((item): item is LikelyWorkPackage => Boolean(item.label))
}

export function tenPointScore(score: number | null): string | null {
  if (score === null) return null
  // The scoring engine has no hard maximum. Cap the display only; its stored
  // score and band remain the source of ordering and qualification.
  return (Math.min(Math.max(score, 0), 100) / 10).toFixed(1)
}

export function projectType(app: PlanningApplication): string | null {
  const value = app.raw_data?.app_type
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function projectStage(app: PlanningApplication): string {
  const type = projectType(app)?.toLowerCase()
  const status = app.status?.toLowerCase() ?? ''

  if (status.includes('withdraw')) return 'Withdrawn'
  if (status.includes('refus') || status.includes('reject')) return 'Refused'
  if (type === 'outline') return status.includes('approv') || status.includes('grant') ? 'Outline approved' : 'Outline application'
  if (type === 'conditions') return 'Condition / discharge activity'
  if (type === 'amendment') return 'Amendment activity'
  if (status.includes('approv') || status.includes('grant') || status.includes('permit')) return 'Approved'
  if (type === 'full') return 'Full / detailed application'
  return app.status || 'Stage not available'
}

function sourceScaleReason(reasons: string[] | null): string | null {
  return (reasons ?? []).find((reason) => /^(Large|Medium|Small) scheme|^Large site/.test(reason)) ?? null
}

export function whyThisMatters(app: PlanningApplication): string {
  const packages = likelyWorkPackages(app.score_reasons)
  const scale = sourceScaleReason(app.score_reasons)

  if (packages.length === 0) {
    return 'This opportunity is visible because it sits in your tracked territory. The available source description does not currently expose a specific civils work-package signal.'
  }

  const packageList = packages.map((item) => item.label).join(', ')
  const scaleText = scale ? ` The source description also produced this scale signal: ${scale.replace(/\s*\([+-]\d+\)\s*$/, '')}.` : ''
  return `PlanningPing found indicators for ${packageList} in the available planning record.${scaleText} These are likely packages to qualify, not confirmed tender packages.`
}

export function salesTiming(app: PlanningApplication): { label: string; body: string } {
  const status = app.status?.toLowerCase() ?? ''

  if (status.includes('withdraw') || status.includes('refus') || status.includes('reject')) {
    return {
      label: 'No active approach window indicated',
      body: `The source record is currently marked ${app.status}. Keep it for context, but do not treat planning status as evidence of a live construction package.`,
    }
  }

  if (app.decision_date) {
    return {
      label: 'Post-decision review',
      body: `A planning decision is recorded for this project. Approval does not mean construction has started; check later planning activity and source documents before treating it as a procurement signal.`,
    }
  }

  if (app.target_decision_date) {
    return {
      label: 'Early relationship window',
      body: `The authority's target decision date is on file. This may be a useful point to research the project team and monitor the record while planning is still active.`,
    }
  }

  return {
    label: 'Planning-stage monitoring',
    body: 'The available source record has no decision date. Research the known project team and monitor the planning record before assuming a construction programme.',
  }
}
