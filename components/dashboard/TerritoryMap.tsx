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

export default function TerritoryMap({ centerLat, centerLng, radiusMetres, label, applications }: Props) {
  return (
    <div className="h-72 w-full overflow-hidden rounded-lg border border-gray-200 sm:h-96">
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={14}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterOnChange lat={centerLat} lng={centerLng} radiusMetres={radiusMetres} />

        <Circle
          center={[centerLat, centerLng]}
          radius={radiusMetres}
          pathOptions={{ color: '#2563EB', fillColor: '#2563EB', fillOpacity: 0.08, weight: 1.5 }}
        />
        <Marker position={[centerLat, centerLng]}>
          <Popup>{label}</Popup>
        </Marker>

        {applications.map((app) => (
          <Marker key={app.id} position={[app.lat, app.lng]}>
            <Popup>
              <div className="text-xs">
                <p className="font-mono font-semibold text-[#2563EB]">{app.reference}</p>
                {app.address && <p className="mt-1">{app.address}</p>}
                {app.status && <p className="mt-1 text-gray-500">{app.status}</p>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
