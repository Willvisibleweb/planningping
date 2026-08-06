// Classifies a council status string into a decision outcome.
//
// Deliberately the same keyword vocabulary as lib/statusStyle.ts, so the pill
// on a row and the alert about that row can never disagree about whether an
// application was approved.
//
// Framed for business development rather than neutrality: for a civils firm,
// "this one is dead, stop chasing it" is worth as much as "this one is live".
// That's why refusals and withdrawals alert too, not just approvals.

export type DecisionOutcome = 'approved' | 'refused' | 'withdrawn' | 'decided'

export function classifyDecision(status: string | null): DecisionOutcome | null {
  if (!status) return null
  const s = status.toLowerCase()

  // Order matters: "application withdrawn following refusal" should read as
  // withdrawn, and councils do write strings like that. Specific outcomes are
  // tested before the generic one so "Decided: Granted" lands on approved.
  if (/withdraw/.test(s)) return 'withdrawn'
  if (/refus|reject|dismiss/.test(s)) return 'refused'
  if (/approv|grant|permit/.test(s)) return 'approved'

  // Some authorities publish a bare "Decided" or "Determined" with no outcome
  // in the status text at all — 20 such rows exist in production today. It is
  // still a decision worth alerting on, but we genuinely don't know which way
  // it went, so the copy says so rather than guessing. Notably this never
  // triggers the partner block: suggesting site monitoring for something that
  // might have been refused would read as automated noise.
  if (/^decided\b|^determined\b|\bdecision (issued|made)\b/.test(s)) return 'decided'

  // Deliberately NOT decisions:
  //   "Application Invalid" — procedural, usually revalidated and continues.
  //   "Unknown", "Conditions" — too ambiguous to act on.
  return null
}

/** True once a status represents any final decision. */
export function isDecided(status: string | null): boolean {
  return classifyDecision(status) !== null
}

export const DECISION_COPY: Record<
  DecisionOutcome,
  { label: string; headline: string; meaning: string; tone: 'success' | 'danger' | 'neutral' }
> = {
  approved: {
    label: 'Approved',
    headline: 'approved',
    meaning: 'Consent granted — this site is now live work. Groundworks typically follow within weeks.',
    tone: 'success',
  },
  refused: {
    label: 'Refused',
    headline: 'refused',
    meaning: 'Refused by the authority. Worth watching for a resubmission rather than pursuing now.',
    tone: 'danger',
  },
  withdrawn: {
    label: 'Withdrawn',
    headline: 'withdrawn',
    meaning: 'Pulled by the applicant. Often precedes a revised submission on the same site.',
    tone: 'neutral',
  },
  decided: {
    label: 'Decided',
    headline: 'decided',
    meaning:
      'The authority has issued a decision but hasn’t published the outcome in its status feed. Check the council portal to see which way it went.',
    tone: 'neutral',
  },
}
