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
  return (
    // The height lives HERE, on the wrapper, and the map fills it.
    //
    // The first version set height:100% inline on MapContainer alongside a
    // Tailwind h-[380px] class. Inline styles beat classes, so the class was
    // ignored and 100% resolved against a parent with no height of its own —
    // the map computed to zero and left a blank white column where it should
    // have been. Leaflet gives no warning for this; it simply draws nothing.
    <div className="h-[380px] overflow-hidden rounded-md border border-border bg-surface sm:h-[460px]">
      <MapContainer
        center={UK_CENTRE}
        zoom={6}
        minZoom={5}
        maxZoom={9}
        scrollWheelZoom={false}
        // A landing-page map that hijacks the scroll wheel is a trap. Dragging
        // and the zoom control remain, so it is still explorable on purpose.
        style={{ height: '100%', width: '100%', background: '#f8f8f9' }}
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
