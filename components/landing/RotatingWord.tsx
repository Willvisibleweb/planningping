'use client'

import { useEffect, useState } from 'react'

// The real service disciplines the scoring engine (lib/scoring/civilsCriteria.ts)
// actually covers — not an arbitrary marketing list.
const WORDS = ['drainage', 'highways', 'flood risk', 'SuDS', 'groundworks', 'structural work']
const INTERVAL_MS = 2200
const TRANSITION_MS = 450

export default function RotatingWord() {
  const [current, setCurrent] = useState(0)
  const [leaving, setLeaving] = useState<number | null>(null)

  // Continuous, repeating motion is the kind prefers-reduced-motion exists
  // for — so when it's set, the interval never starts at all (not just a
  // de-animated instant swap every 2s, which could still be distracting).
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const timer = setInterval(() => {
      setCurrent((c) => {
        setLeaving(c)
        return (c + 1) % WORDS.length
      })
    }, INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  // Drop the outgoing word from the DOM once its fade-out has finished.
  useEffect(() => {
    if (leaving === null) return
    const t = setTimeout(() => setLeaving(null), TRANSITION_MS)
    return () => clearTimeout(t)
  }, [leaving])

  // An invisible copy of the longest word reserves the box's real width/height
  // from actual rendered text metrics, so the headline never reflows as
  // shorter or longer words rotate in — only the visible word crossfades.
  const longest = WORDS.reduce((a, b) => (a.length > b.length ? a : b))

  return (
    <span className="relative inline-block align-bottom">
      <span aria-hidden="true" className="invisible">{longest}</span>
      {leaving !== null && (
        <span
          key={`leave-${leaving}`}
          aria-hidden="true"
          className="motion-safe-fade absolute left-0 top-0 whitespace-nowrap text-primary-500"
          style={{ animation: `word-leave ${TRANSITION_MS}ms cubic-bezier(.2,.7,.3,1) forwards` }}
        >
          {WORDS[leaving]}
        </span>
      )}
      <span
        key={`current-${current}`}
        className="motion-safe-fade absolute left-0 top-0 whitespace-nowrap text-primary-500"
        style={{ animation: `word-enter ${TRANSITION_MS}ms cubic-bezier(.2,.7,.3,1) forwards` }}
      >
        {WORDS[current]}
      </span>
    </span>
  )
}
