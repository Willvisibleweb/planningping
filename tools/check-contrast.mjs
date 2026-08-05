// WCAG 2.1 contrast check for every foreground/background pairing the app
// actually renders. AA needs 4.5:1 for normal text, 3:1 for large (>=18.66px
// bold or >=24px) and for UI component boundaries.

const T = {
  white: '#ffffff',
  surface: '#ffffff',
  'surface-sunken': '#f8f8f9',
  'neutral-100': '#f1f1f3',
  'neutral-200': '#e3e3e7',
  'neutral-400': '#a0a1a6',
  'neutral-500': '#757579',
  'neutral-600': '#6b6c70',
  'neutral-700': '#55565b',
  'neutral-900': '#202124',
  'primary-50': '#f5f8ff',
  'primary-100': '#eaf0ff',
  'primary-200': '#d6e4fb',
  'border-control': '#8e8f93',
  'primary-500': '#2563eb',
  'primary-600': '#1d4ed8',
  'primary-700': '#1e40af',
  'primary-900': '#1b3474',
  'success-50': '#ecfdf5',
  'success-600': '#047857',
  'success-700': '#036049',
  'warning-50': '#fffbeb',
  'warning-600': '#b45309',
  'warning-700': '#92400e',
  'danger-50': '#fef2f2',
  'danger-600': '#b91c1c',
  'danger-700': '#991b1b',
}

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(a, b) {
  const [l1, l2] = [lum(T[a]), lum(T[b])].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

// [foreground, background, label, isLargeOrUI]
const PAIRS = [
  ['neutral-900', 'surface', 'body ink on white'],
  ['neutral-900', 'surface-sunken', 'ink on sunken surface'],
  ['neutral-600', 'surface', 'muted text on white'],
  ['neutral-600', 'surface-sunken', 'muted on sunken'],
  ['neutral-600', 'primary-50', 'muted on primary tint (row hover)'],
  ['neutral-600', 'neutral-100', 'muted on neutral-100'],
  ['neutral-500', 'surface', 'placeholder / faint label on white'],
  ['neutral-700', 'neutral-100', 'Badge neutral tone'],
  ['primary-500', 'surface', 'brand text/link on white'],
  ['primary-600', 'surface', 'link hover on white'],
  ['primary-700', 'primary-50', 'Badge primary tone'],
  ['primary-700', 'primary-100', 'sidebar active row'],
  ['white', 'primary-500', 'white on primary button', true],
  ['white', 'neutral-900', 'white on dark filter pill'],
  ['success-600', 'success-50', 'Badge success'],
  ['success-600', 'surface', 'success text on white'],
  ['success-700', 'success-50', 'Alert success'],
  ['warning-600', 'warning-50', 'Badge warning'],
  ['warning-600', 'surface', 'warning text on white'],
  ['warning-700', 'warning-50', 'Alert warning'],
  ['danger-600', 'danger-50', 'Badge danger'],
  ['danger-600', 'surface', 'danger text / validation on white'],
  ['danger-700', 'danger-50', 'Alert danger'],
  // Non-text: borders and decorative icons only.
  ['neutral-500', 'surface', 'meaningful icon buttons (close, sign out, search)', true],
  ['border-control', 'surface', 'form control boundary (WCAG 1.4.11)', true],
]

let fails = 0
console.log('fg / bg'.padEnd(46), 'ratio'.padStart(7), '  need   verdict')
console.log('-'.repeat(78))

for (const [fg, bg, label, large] of PAIRS) {
  const r = ratio(fg, bg)
  const need = large ? 3 : 4.5
  const ok = r >= need
  if (!ok) fails++
  console.log(
    `${label} (${fg} on ${bg})`.padEnd(46),
    r.toFixed(2).padStart(7),
    ` ${need.toFixed(1)}    ${ok ? 'PASS' : '*** FAIL ***'}`,
  )
}

console.log('-'.repeat(78))
console.log(fails === 0 ? 'All pairings meet WCAG AA.' : `${fails} pairing(s) FAIL WCAG AA.`)
