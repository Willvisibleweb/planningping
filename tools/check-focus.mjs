// Finds interactive elements that suppress the focus outline without
// providing a replacement ring. Everything else inherits the global
// :focus-visible outline from globals.css, so it is covered by default.

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const files = execSync(
  "find app components -name '*.tsx' -not -path 'app/ui-preview/*'",
  { cwd: '/Users/williamkelsall/Desktop/planning ping', encoding: 'utf8' },
)
  .trim()
  .split('\n')

const TAG = /<(button|a|Link|input|select|textarea)\b([\s\S]*?)(?:\/>|>)/g

let suppressed = 0
let total = 0
const problems = []

for (const file of files) {
  const src = readFileSync(`/Users/williamkelsall/Desktop/planning ping/${file}`, 'utf8')
  for (const m of src.matchAll(TAG)) {
    const [, tag, attrs] = m
    total++
    const killsOutline = /outline-none/.test(attrs)
    const hasRing = /focus-visible:ring|focus:ring|has-\[:focus-visible\]:ring/.test(attrs)
    if (killsOutline && !hasRing) {
      suppressed++
      const line = src.slice(0, m.index).split('\n').length
      problems.push(`${file}:${line}  <${tag}>`)
    }
  }
}

console.log(`interactive elements scanned: ${total}`)
console.log(`outline suppressed with no replacement ring: ${suppressed}`)
if (problems.length) {
  console.log('\n' + problems.join('\n'))
} else {
  console.log('\nnone — every element either has a designed ring or inherits the global :focus-visible outline')
}
