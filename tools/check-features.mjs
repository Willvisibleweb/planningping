// Asserts the gating layer fails closed. Run: node tools/check-features.mjs
import { getUserFeatures } from '../lib/features.ts'

// [label, profile]
const cases = [
  ['null profile (signed out)',        null],
  ['homeowner, no partnership',        { partnership_provider: null }],
  ['professional, no partnership',     { partnership_provider: null }],
  ['partnership undefined',            {}],
  ['unknown provider (bad data)',      { partnership_provider: 'acme' }],
  ['gabrielcam partner',               { partnership_provider: 'gabrielcam' }],
]

let fail = 0
for (const [label, profile] of cases) {
  const f = getUserFeatures(profile)
  const siteMonitoring = f.siteMonitoring
  // Only a real gabrielcam partner may ever get siteMonitoring.
  const shouldHaveSiteMonitoring = profile?.partnership_provider === 'gabrielcam'
  const ok = siteMonitoring === shouldHaveSiteMonitoring
  if (!ok) fail++
  console.log(
    `${ok ? 'PASS' : '*** FAIL ***'}  ${label.padEnd(32)} siteMonitoring=${String(siteMonitoring).padEnd(5)} widget=${String(f.partnerWidget).padEnd(5)} hasPartnership=${f.hasPartnership}`
  )
}
console.log(fail === 0 ? '\nAll gating cases behave correctly.' : `\n${fail} FAILED`)
process.exit(fail === 0 ? 0 : 1)
