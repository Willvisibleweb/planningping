'use client'

// Scroll-reveal: children fade and rise as they enter the viewport.
//
// IntersectionObserver rather than a scroll listener, because a listener fires
// on every frame of every scroll and has to be throttled by hand; the observer
// fires once per element per crossing and costs nothing in between. And no
// animation library — this is four lines of state and a CSS transition, which
// is not worth 30kB of JavaScript to a landing page whose job is to load fast.
//
// Deliberately one-shot: `unobserve` after the first crossing, so content does
// not re-animate when the user scrolls back up. Re-animating on every pass is
// the single fastest way to make a page feel like a toy rather than a tool.
//
// Reduced motion is handled by the global rule in globals.css, which collapses
// transition-duration to 0.01ms. The element still ends at opacity 1 because
// the visible state is the default and the transform is the thing being
// animated away from — so a reduced-motion user sees content, instantly, with
// no layout difference.

import { useEffect, useRef, useState } from 'react'

export default function Reveal({
  children,
  delayMs = 0,
  className = '',
}: {
  children: React.ReactNode
  /** Stagger within a group. Keep under ~200ms; beyond that it reads as lag. */
  delayMs?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // No observer (old browser, or a crawler running JS): show it. Content
    // must never depend on the animation having run.
    //
    // Deferred a frame rather than set straight away: a setState in an effect
    // body runs during commit and forces a second render pass before paint.
    // One frame later is after commit, which is both cheaper and what the
    // lint rule is actually asking for.
    if (typeof IntersectionObserver === 'undefined') {
      const id = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(id)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setShown(true)
        observer.unobserve(entry.target)
      },
      // Fires slightly before the element reaches the bottom edge, so it has
      // finished animating by the time it is properly in view rather than
      // animating under the reader's eye.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-slow ease-standard ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      } ${className}`}
      style={{ transitionDelay: shown ? `${delayMs}ms` : '0ms' }}
    >
      {children}
    </div>
  )
}
