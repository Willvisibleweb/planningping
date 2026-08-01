'use client'

// next/dynamic's ssr:false is only allowed inside a Client Component (Next.js
// 16 build restriction) — this thin wrapper is that boundary, so the server
// page can import a plain component without knowing about the dynamic import.

import dynamic from 'next/dynamic'
import type { MapApplication } from './TerritoryMap'

const TerritoryMap = dynamic(() => import('./TerritoryMap'), {
  ssr: false,
  loading: () => (
    <div className="h-72 animate-pulse rounded-lg border border-gray-200 bg-gray-50 sm:h-96" />
  ),
})

export default function TerritoryMapLoader(props: {
  centerLat: number
  centerLng: number
  radiusMetres: number
  label: string
  applications: MapApplication[]
  totalApplicationsCount: number
}) {
  return <TerritoryMap {...props} />
}
