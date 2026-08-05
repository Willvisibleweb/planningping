'use client'

// Leaflet map for a single territory: a center marker for the tracked
// postcode, a circle showing the tracking radius, and a pin for every
// application that has coordinates (PlanIt-sourced rows carry lat/lng in
// raw_data). This file is always loaded via next/dynamic with ssr:false from
// the parent page — Leaflet touches `window` and cannot run server-side.

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Mirrors --color-primary-500 in globals.css. Leaflet draws to canvas/SVG and
// takes a colour string, so this is the one value in the app that can't come
// from a Tailwind class. Change it here if the brand blue ever changes.
const PRIMARY_500 = '#2563EB'

// Leaflet's default marker icon resolves its image paths relative to the
// bundler's asset pipeline, which breaks under webpack/Next.js by default —
// a well-known Leaflet+React gotcha. Pointing at the CDN copies (matching the
// installed leaflet version) sidesteps the bundler entirely.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export interface MapApplication {
  id: string
  lat: number
  lng: number
  reference: string
  address: string | null
  status: string | null
}

interface Props {
  centerLat: number
  centerLng: number
  radiusMetres: number
  label: string
  applications: MapApplication[]
  // Total applications for this territory, including ones with no known
  // coordinates (older/pre-PlanIt records) that can't be pinned. Used only to
  // show an honest "N of M" caption — never to cap what's actually plotted.
  totalApplicationsCount: number
}

// Keeps the view centred/zoomed correctly when the radius changes (e.g. after
// the radius-control slider updates) without remounting the whole map.
function RecenterOnChange({ lat, lng, radiusMetres }: { lat: number; lng: number; radiusMetres: number }) {
  const map = useMap()
  useEffect(() => {
    const zoom = radiusMetres <= 500 ? 15 : radiusMetres <= 1500 ? 14 : radiusMetres <= 3000 ? 13 : 12
    map.setView([lat, lng], zoom)
  }, [map, lat, lng, radiusMetres])
  return null
}

export default function TerritoryMap({
  centerLat,
  centerLng,
  radiusMetres,
  label,
  applications,
  totalApplicationsCount,
}: Props) {
  return (
    <div>
      <div className="h-72 w-full overflow-hidden rounded-md border border-border sm:h-96">
        <MapContainer
          center={[centerLat, centerLng]}
          zoom={14}
          // Leaflet defaults to zoomSnap=1 (whole-integer zoom levels), which
          // is what makes scroll-zoom feel like it jumps in chunks rather
          // than gliding smoothly. Fractional snap/delta + a higher
          // wheelPxPerZoomLevel gives much finer, smoother increments —
          // core Leaflet options, no extra dependency needed.
          zoomSnap={0.25}
          zoomDelta={0.5}
          wheelPxPerZoomLevel={90}
          scrollWheelZoom
          touchZoom
          doubleClickZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <RecenterOnChange lat={centerLat} lng={centerLng} radiusMetres={radiusMetres} />

          {/* The one place a literal brand hex is unavoidable: Leaflet takes a
              colour string for canvas/SVG path options, not a CSS class, so it
              can't read the token. Kept in step with --color-primary-500. */}
          <Circle
            center={[centerLat, centerLng]}
            radius={radiusMetres}
            pathOptions={{ color: PRIMARY_500, fillColor: PRIMARY_500, fillOpacity: 0.08, weight: 1.5 }}
          />
          <Marker position={[centerLat, centerLng]}>
            <Popup>{label}</Popup>
          </Marker>

          {applications.map((app) => (
            <Marker key={app.id} position={[app.lat, app.lng]}>
              <Popup>
                <div className="text-xs">
                  <p className="tabular-data font-semibold text-primary-500">{app.reference}</p>
                  {app.address && <p className="mt-1">{app.address}</p>}
                  {app.status && <p className="mt-1 text-ink-muted">{app.status}</p>}
                  {/* Plain same-page anchor link — jumps to and highlights the
                      matching row in the list below (see globals.css :target
                      rule). No client-side state lifting needed between the
                      map and the list, which live in separate component trees. */}
                  <a href={`#app-${app.id}`} className="mt-2 inline-block font-medium text-primary-500 hover:underline">
                    View full details &darr;
                  </a>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {totalApplicationsCount > applications.length && (
        <p className="mt-1.5 text-xs text-ink-muted">
          Showing {applications.length} of {totalApplicationsCount} applications on the map — only ones
          within the tracking radius with known coordinates from the source can be pinned. All{' '}
          {totalApplicationsCount} are listed below.
        </p>
      )}
    </div>
  )
}
