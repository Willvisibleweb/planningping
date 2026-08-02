// Territory detail page — one tracked area's own page: a map of where it is,
// its full application list (sorted by distance when we have coordinates),
// the radius control, and outbound links to the council portal and this
// area's public SEO pages (only shown when they actually exist/resolve).

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasProAccess } from '@/lib/access'
import { lookupPostcode, postcodeDistrict, distanceKm } from '@/lib/postcodes'
import RadiusControl from '@/components/dashboard/RadiusControl'
import TrackedAreaSettings from '@/components/dashboard/TrackedAreaSettings'
import ApplicationSearchList from '@/components/dashboard/ApplicationSearchList'
import TerritoryMap from '@/components/dashboard/TerritoryMapLoader'
import type { TrackedArea, PlanningApplication } from '@/types/database'
import type { MapApplication } from '@/components/dashboard/TerritoryMap'

export default async function TerritoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: areaRow } = await supabase
    .from('tracked_areas')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!areaRow) notFound()
  const area = areaRow as TrackedArea

  // min_band is the same stored preference the alert cron reads — one knob
  // for both "what you see" and "what you get emailed about".
  let applicationsQuery = supabase
    .from('planning_applications')
    .select('*')
    .eq('council_slug', area.council_slug)
  if (area.min_band === 'WARM_PLUS') applicationsQuery = applicationsQuery.in('band', ['HOT', 'WARM'])
  else if (area.min_band === 'HOT_ONLY') applicationsQuery = applicationsQuery.eq('band', 'HOT')

  const [{ data: applications }, { data: councilRow }, { data: leads }, geo] = await Promise.all([
    applicationsQuery.order('application_date', { ascending: false, nullsFirst: false }).limit(200),
    supabase.from('councils').select('name, portal_url').eq('slug', area.council_slug).maybeSingle(),
    supabase.from('tracked_leads').select('application_id'),
    lookupPostcode(area.postcode),
  ])

  const apps = (applications ?? []) as PlanningApplication[]
  const trackedIds = new Set((leads ?? []).map((l) => l.application_id as string))
  const profile = await getProfile()
  const showTrackActions = hasProAccess(profile)

  // Pull lat/lng out of raw_data (PlanIt-sourced rows carry it) and compute
  // distance from the territory's center when we have both. Apps without
  // coordinates still show — just without a distance and off the map.
  const withDistance = apps.map((app) => {
    const raw = app.raw_data as { lat?: unknown; lng?: unknown } | null
    const lat = typeof raw?.lat === 'number' ? raw.lat : null
    const lng = typeof raw?.lng === 'number' ? raw.lng : null
    const distance = geo && lat !== null && lng !== null ? distanceKm(geo.lat, geo.lng, lat, lng) : null
    return { app, lat, lng, distance }
  })

  const sorted = geo
    ? [...withDistance].sort((a, b) => {
        if (a.distance === null && b.distance === null) return 0
        if (a.distance === null) return 1
        if (b.distance === null) return -1
        return a.distance - b.distance
      })
    : withDistance

  const mapApplications: MapApplication[] = sorted
    .filter((x): x is typeof x & { lat: number; lng: number } => x.lat !== null && x.lng !== null)
    .map((x) => ({ id: x.app.id, lat: x.lat, lng: x.lng, reference: x.app.reference, address: x.app.address, status: x.app.status }))

  // Outbound links — only shown when we know they resolve to something real,
  // never a dead link.
  const district = postcodeDistrict(area.postcode)
  const [{ data: councilSeo }, { data: postcodeSeo }] = await Promise.all([
    supabase.from('seo_locations').select('slug').eq('tier', 'council').eq('slug', area.council_slug).maybeSingle(),
    district
      ? supabase.from('seo_locations').select('slug').eq('tier', 'postcode').eq('slug', district).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <a href="/dashboard" className="text-xs font-medium text-[#2563EB] hover:underline">
          &larr; Back to territory
        </a>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold text-[#202124]">{area.label}</h2>
          <span className="text-sm text-[#6B6C70]">
            {apps.length} application{apps.length === 1 ? '' : 's'}
          </span>
        </div>
        <p className="text-sm text-[#6B6C70] mt-0.5">
          {area.postcode} — {councilRow?.name ?? area.council_slug}
        </p>
      </div>

      {geo ? (
        <TerritoryMap
          centerLat={geo.lat}
          centerLng={geo.lng}
          radiusMetres={area.radius_metres}
          label={area.label}
          applications={mapApplications}
          totalApplicationsCount={apps.length}
        />
      ) : (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[#D6E4FB] text-sm text-[#A0A1A6]">
          Could not locate this postcode on the map.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <RadiusControl areaId={area.id} initialRadiusMetres={area.radius_metres} />
        <TrackedAreaSettings
          areaId={area.id}
          initialMinBand={area.min_band}
          initialAlertsEnabled={area.alerts_enabled}
          hasProAccess={showTrackActions}
        />

        {(councilRow?.portal_url || councilSeo || postcodeSeo) && (
          <div className="rounded-lg border border-[#D6E4FB] bg-white p-4">
            <h3 className="text-sm font-medium text-[#202124]">Links</h3>
            <ul className="mt-2 space-y-1.5">
              {councilRow?.portal_url && (
                <li>
                  <a
                    href={councilRow.portal_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-xs font-medium text-[#2563EB] hover:underline"
                  >
                    {councilRow.name ?? area.council_slug} planning portal &rarr;
                  </a>
                </li>
              )}
              {councilSeo && (
                <li>
                  <a href={`/planning-applications/${area.council_slug}`} className="text-xs font-medium text-[#2563EB] hover:underline">
                    Public {councilRow?.name ?? area.council_slug} applications page &rarr;
                  </a>
                </li>
              )}
              {postcodeSeo && district && (
                <li>
                  <a href={`/planning-applications/postcode/${district}`} className="text-xs font-medium text-[#2563EB] hover:underline">
                    Public {district.toUpperCase()} postcode page &rarr;
                  </a>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-[#D6E4FB] bg-white p-5">
        <h3 className="text-sm font-medium text-[#202124] mb-3">Applications</h3>
        <ApplicationSearchList
          items={sorted.map(({ app, distance }) => ({
            app,
            distanceKm: distance,
            isTracked: trackedIds.has(app.id),
          }))}
          showTrackActions={showTrackActions}
        />
      </div>
    </div>
  )
}
