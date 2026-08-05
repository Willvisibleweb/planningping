// Discharge-of-condition classification engine. Deliberately "dumb" like
// scoreApplication.ts — all tunable data lives in dischargeCriteria.ts, this
// file is just the mechanism. Never throws: a classification bug must never
// block ingestion of an otherwise-good row.

import { DISCHARGE_KEYWORDS, RESERVED_MATTERS_PATTERN, PARENT_REF_PATTERNS } from './dischargeCriteria'

export interface ClassifiableApplication {
  description: string | null
  // PlanIt's raw_data.app_type — accepted for signature completeness /
  // future tuning. Not currently load-bearing in the decision: verified
  // against live data that app_type='Conditions' alone can't disambiguate
  // discharge applications from condition variations (S73), S106 compliance
  // submissions, or reserved matters applications that share the same
  // PlanIt bucket.
  appType?: string | null
}

export interface ClassificationResult {
  applicationType: 'discharge_of_condition' | null
  parentReferenceRaw: string | null
  // True iff discharge-classified but no parent reference could be parsed —
  // surfaced in the UI as "could not be automatically identified" rather
  // than silently leaving a blank.
  needsReview: boolean
}

function empty(): ClassificationResult {
  return { applicationType: null, parentReferenceRaw: null, needsReview: false }
}

export function classifyApplication(app: ClassifiableApplication): ClassificationResult {
  try {
    const text = app.description ?? ''
    if (!text) return empty()
    if (RESERVED_MATTERS_PATTERN.test(text)) return empty()

    const haystack = text.toLowerCase()
    const isDischarge = DISCHARGE_KEYWORDS.some((kw) => haystack.includes(kw))
    if (!isDischarge) return empty()

    let parentReferenceRaw: string | null = null
    for (const re of PARENT_REF_PATTERNS) {
      const m = re.exec(text)
      if (m?.[1]) {
        parentReferenceRaw = m[1].trim()
        break
      }
    }

    return {
      applicationType: 'discharge_of_condition',
      parentReferenceRaw,
      needsReview: parentReferenceRaw === null,
    }
  } catch {
    return empty()
  }
}
