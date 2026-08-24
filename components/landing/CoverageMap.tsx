'use client'

// National coverage map — a proportional-symbol map, not a pin drop.
//
// The data's job here is magnitude across geography, so circle AREA is
// proportional to the count and radius scales with its square root. Scaling the
// radius directly would be a lie the eye believes: Coventry holds 1562
// applications against Leicester's 7, and a linear radius would make one dot
// swallow the Midlands while the other vanished.
//
// One hue, not a palette. This is a single sequential quantity — size already
// carries it — so a second colour dimension would encode nothing and only risk
// a colourblind-unsafe pair. Every circle is brand blue; the labels and the
// table carry identity, never colour alone.

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet'
import type { CoveragePoint } from '@/lib/analytics/coverageMap'
import 'leaflet/dist/leaflet.css'

// Centres Great Britain without cropping the north or the south west.
const UK_CENTRE: [number, number] = [53.2, -2.0]

const MIN_RADIUS = 7
const RADIUS_RANGE = 27

export default function CoverageMap({ points }: { points: CoveragePoint[] }) {
  const max = Math.max(...points.map((p) => p.count), 1)
  // Labels only on the handful that can carry one without collision. A number
  // on every mark is noise, and on a map it is unreadable overlap.
  const labelled = new Set(points.slice(0, 5).map((p) => p.slug))
  const [ready, setReady] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  // Leaflet measures its container on mount. Rendered inside a section that may
  // still be animating in, it can size itself to zero and stay blank until a
  // resize — so the size is invalidated once after paint.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 50)
    return () => clearTimeout(t)
  }, [])

  return (
    <div ref={wrap} className="overflow-hidden rounded-md border border-border bg-surface">
      <MapContainer
        center={UK_CENTRE}
        zoom={6}
        minZoom={5}
        maxZoom={9}
        scrollWheelZoom={false}
        // A landing-page map that hijacks the scroll wheel is a trap. Dragging
        // and the zoom control remain, so it is still explorable on purpose.
        style={{ height: '100%', width: '100%', background: '#f8f8f9' }}
        className="h-[380px] sm:h-[460px]"
        key={ready ? 'ready' : 'init'}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {points.map((p) => (
          <CircleMarker
            key={p.slug}
            center={[p.lat, p.lng]}
            radius={MIN_RADIUS + Math.sqrt(p.count / max) * RADIUS_RANGE}
            pathOptions={{
              color: '#2563eb',
              weight: 1.5,
              // A 2px-equivalent surface ring so overlapping London boroughs
              // stay countable rather than merging into one blob.
              opacity: 0.9,
              fillColor: '#2563eb',
              fillOpacity: 0.28,
            }}
          >
            <Tooltip
              direction="top"
              offset={[0, -4]}
              permanent={labelled.has(p.slug)}
              className="pp-map-label"
            >
              <span className="font-semibold">{p.count.toLocaleString()}</span>{' '}
              <span className="text-ink-muted">{p.name}</span>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
