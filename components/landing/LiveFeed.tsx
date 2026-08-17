'use client'

// A slow vertical marquee of genuinely real planning applications.
//
// The rows are not invented. They come from public_applications — the view
// built for exactly this, exposing a curated column set and withholding
// anything newer than 7 days so that fresh data stays a paid feature. So the
// references, addresses and descriptions on the landing page are the real
// register, which is the whole argument for putting them there: a mocked-up
// feed of plausible-looking rows says nothing a screenshot could not, while a
// real one demonstrates the product is running.
//
// What is deliberately NOT shown is the score. Scoring is the paid product, and
// public_applications excludes score and band on purpose. The fit labels appear
// elsewhere on the page as clearly-framed product UI rather than being attached
// to these real rows, so nothing here implies a score we are not showing.
//
// The animation duplicates the list once and translates by exactly -50%, which
// is what makes the loop seamless: at the end of the cycle the second copy sits
// precisely where the first began. aria-hidden on the duplicate keeps a screen
// reader from reading every entry twice.

import type { FeedItem } from './feedData'

export default function LiveFeed({ items }: { items: FeedItem[] }) {
  if (items.length === 0) return null

  // Slower with more rows so the pixels-per-second stays constant regardless of
  // how many the query returned — otherwise a short list races and a long one
  // crawls.
  const durationSec = Math.max(items.length * 3.5, 24)

  return (
    <div
      className="relative h-[340px] overflow-hidden rounded-md border border-border bg-surface"
      // Fades the rows out at both edges instead of clipping them against a
      // hard line, so the list reads as continuing rather than stopping.
      style={{
        maskImage: 'linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)',
      }}
    >
      <div className="flex items-center justify-between border-b border-border bg-surface-sunken px-4 py-2.5">
        <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
          Live from the register
        </span>
        <span className="flex items-center gap-1.5 text-2xs text-ink-muted">
          <span className="relative flex h-1.5 w-1.5">
            <span className="pp-feed-ping absolute inline-flex h-full w-full rounded-full bg-success-600 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success-600" />
          </span>
          Updated daily
        </span>
      </div>

      <div className="pp-marquee" style={{ animationDuration: `${durationSec}s` }}>
        {[0, 1].map((copy) => (
          <div key={copy} aria-hidden={copy === 1 ? 'true' : undefined}>
            {items.map((item) => (
              <div
                key={`${copy}-${item.id}`}
                className="flex items-start gap-3 border-b border-border/60 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="tabular-data text-2xs font-semibold text-primary-500">
                      {item.reference}
                    </span>
                    <span className="truncate text-2xs text-neutral-500">{item.council}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-ink">{item.description}</p>
                  {item.address && (
                    <p className="mt-0.5 line-clamp-1 text-2xs text-neutral-500">{item.address}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
