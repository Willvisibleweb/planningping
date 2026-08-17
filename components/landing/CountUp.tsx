'use client'

// A number that counts up when it first scrolls into view.
//
// Worth the effort only because the numbers are real: the count is passed in
// from a server component that queried the database, so what animates is the
// actual coverage figure rather than a decorative one. A counter that ticks up
// to an invented number is the kind of thing a buyer in this market notices.
//
// Renders the final value as the initial state when motion is reduced, and the
// server-rendered HTML always contains the real figure — so the number is
// present for crawlers and for anyone who never scrolls it into view.

import { useEffect, useRef, useState } from 'react'

// ~900ms feels deliberate; much longer and the reader has moved on, much
// shorter and it may as well not animate.
const DURATION_MS = 900

// Fast at first, settling at the end. Matches --ease-standard's character
// closely enough that the counter feels like part of the same system.
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export default function CountUp({
  to,
  suffix = '',
  className = '',
}: {
  to: number
  suffix?: string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [value, setValue] = useState(to)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced || typeof IntersectionObserver === 'undefined') return

    // Drop to zero only once we know we're going to animate — a reduced-motion
    // or no-observer visitor must never be left looking at a 0. Deferred a
    // frame because a setState in an effect body runs during commit and forces
    // a second render before paint; a frame later is after commit, and still
    // long before the counter can be scrolled into view.
    const zero = requestAnimationFrame(() => setValue(0))

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return
        started.current = true
        observer.unobserve(entry.target)

        const start = performance.now()
        let frame = 0
        const tick = (now: number) => {
          const progress = Math.min((now - start) / DURATION_MS, 1)
          setValue(Math.round(easeOut(progress) * to))
          if (progress < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        cleanup = () => cancelAnimationFrame(frame)
      },
      { threshold: 0.4 },
    )

    let cleanup = () => {}
    observer.observe(el)
    return () => {
      cancelAnimationFrame(zero)
      observer.disconnect()
      cleanup()
    }
    // `to` is a fixed server-rendered figure for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <span ref={ref} className={`tabular-data ${className}`}>
      {value.toLocaleString('en-GB')}
      {suffix}
    </span>
  )
}
