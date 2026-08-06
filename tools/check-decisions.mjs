// Asserts classifyDecision against the status strings that actually appear in
// production, not invented ones. Run: node --experimental-strip-types tools/check-decisions.mjs
//
// Refresh the list with:
//   select distinct status from planning_applications where status is not null;

import { classifyDecision } from '../lib/classification/decisionOutcome.ts'

// [status, expected outcome or null]
const REAL_STATUSES = [
  // Undecided — must never alert.
  ['Undecided', null],
  ['Pending', null],
  ['Under consideration/assessment', null],
  ['Pending consideration', null],
  ['Awaiting decision', null],
  ['Awaiting Decision', null],
  ['Awaiting Validation', null],
  ['Registered', null],
  ['Statutory consultation period', null],
  ['Pending decision', null],
  ['Under assessment by case officer', null],

  // Procedural / ambiguous — deliberately not decisions.
  ['Application Invalid', null],
  ['Unknown', null],
  ['Conditions', null],

  // Real decisions.
  ['Permitted', 'approved'],
  ['Granted', 'approved'],
  ['Rejected', 'refused'],
  ['Withdrawn', 'withdrawn'],
  ['Application Withdrawn', 'withdrawn'],
  ['Decided', 'decided'],

  // Wordings not yet seen here but common across UK authorities.
  ['Approved with conditions', 'approved'],
  ['Application Refused', 'refused'],
  ['Appeal Dismissed', 'refused'],
  ['Decided: Granted', 'approved'],
  ['Withdrawn following refusal', 'withdrawn'],
  ['Determined', 'decided'],
  ['Decision issued', 'decided'],
  [null, null],
  ['', null],
]

let fail = 0
for (const [status, expected] of REAL_STATUSES) {
  const got = classifyDecision(status)
  const ok = got === expected
  if (!ok) fail++
  console.log(
    `${ok ? 'PASS' : '*** FAIL ***'}  ${String(status).padEnd(34)} → ${String(got).padEnd(10)} ${ok ? '' : `(expected ${expected})`}`,
  )
}

console.log(
  fail === 0
    ? `\nAll ${REAL_STATUSES.length} status strings classify correctly.`
    : `\n${fail} FAILED`,
)
process.exit(fail === 0 ? 0 : 1)
