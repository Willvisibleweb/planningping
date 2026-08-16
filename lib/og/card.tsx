// The shared social card.
//
// One renderer for every page type, so a shared council page, a postcode page
// and the homepage all look like the same product rather than three different
// sites. Used by the opengraph-image.tsx files in each route segment.
//
// Constraints worth knowing before editing this:
//
//   * Satori (what ImageResponse renders with) supports a subset of CSS. Every
//     element with more than one child needs an explicit display:flex — it does
//     not assume block layout, and a missing one throws at build time rather
//     than looking wrong.
//   * No external images or fonts. Anything fetched at build would make image
//     generation depend on the network.
//   * 1200x630 is the size every platform crops from. Keep the important part
//     away from the edges; LinkedIn and WhatsApp crop differently.

import type { ReactElement } from 'react'

// Matches @theme in globals.css. Duplicated rather than imported because Satori
// gets plain values, not CSS variables — a var() here renders as nothing.
const INK = '#202124'
const MUTED = '#6b6c70'
const BRAND = '#2563eb'
const BORDER = '#d6e4fb'
const TINT = '#f5f8ff'

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_CONTENT_TYPE = 'image/png'

export interface CardProps {
  /** Small label above the headline, e.g. "Planning applications". */
  eyebrow: string
  /** The thing this page is about — usually a place name. */
  title: string
  /** One line of supporting detail. */
  subtitle?: string
  /** Bottom-left facts, e.g. "1,240 applications". Kept to two. */
  facts?: string[]
}

export function OgCard({ eyebrow, title, subtitle, facts = [] }: CardProps): ReactElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#ffffff',
        padding: '64px 72px',
        // A brand band down the left edge, so the card is recognisable even as
        // a thumbnail where the text is unreadable.
        borderLeft: `16px solid ${BRAND}`,
      }}
    >
      {/* Wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: 10,
            background: BRAND,
          }}
        >
          {/* The same map pin as the favicon, inlined — Satori renders SVG
              children but cannot fetch an external file. */}
          <svg width="26" height="26" viewBox="0 0 24 24">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" fill="#ffffff" />
            <circle cx="12" cy="10" r="3.2" fill={BRAND} />
          </svg>
        </div>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, color: INK }}>
          <span>Planning</span>
          <span style={{ color: BRAND }}>Ping</span>
        </div>
      </div>

      {/* Headline */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: BRAND,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: title.length > 34 ? 62 : 78,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 1.05,
            color: INK,
            marginTop: 18,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              display: 'flex',
              fontSize: 30,
              lineHeight: 1.4,
              color: MUTED,
              marginTop: 20,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {/* Facts */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {facts.slice(0, 2).map((f, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              fontSize: 24,
              color: INK,
              background: TINT,
              border: `2px solid ${BORDER}`,
              borderRadius: 999,
              padding: '10px 22px',
            }}
          >
            {f}
          </div>
        ))}
        <div style={{ display: 'flex', flexGrow: 1 }} />
        <div style={{ display: 'flex', fontSize: 24, color: MUTED }}>planningping.com</div>
      </div>
    </div>
  )
}
