'use client'

import { useState, useTransition } from 'react'
import { updateTrackedAreaRadius } from './actions'

const MIN = 250
const STEP = 250

function formatMetres(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}km` : `${m}m`
}

export default function RadiusControl({
  areaId,
  initialRadiusMetres,
  maxRadiusMetres,
}: {
  areaId: string
  initialRadiusMetres: number
  // Tier-dependent cap (lib/access.ts). If the stored radius exceeds it
  // (e.g. set during a Top-tier trial, now on Mid), the slider clamps to the
  // cap for interaction but nothing is saved/reduced until the user actually
  // moves it and hits Save — existing over-cap data is never touched silently.
  maxRadiusMetres: number
}) {
  const overCap = initialRadiusMetres > maxRadiusMetres
  const [radius, setRadius] = useState(Math.min(initialRadiusMetres, maxRadiusMetres))
  const [saved, setSaved] = useState(radius)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const dirty = radius !== saved

  function handleSave() {
    setError(null)
    setJustSaved(false)
    startTransition(async () => {
      const result = await updateTrackedAreaRadius(areaId, radius)
      if (result?.error) {
        setError(result.error)
        return
      }
      setSaved(radius)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2500)
    })
  }

  return (
    <div className="rounded-lg border border-[#D6E4FB] bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[#202124]">Tracking radius</h3>
        <span className="font-mono text-sm text-[#6B6C70]">{formatMetres(radius)}</span>
      </div>
      <p className="mt-1 text-xs text-[#A0A1A6]">
        How far from the postcode to pull planning applications from.
      </p>
      {overCap && (
        <p className="mt-1 text-xs text-amber-700">
          Currently set to {formatMetres(initialRadiusMetres)} from a previous plan. Moving this
          slider will reduce it to fit your current plan (up to {formatMetres(maxRadiusMetres)}).
        </p>
      )}
      <input
        type="range"
        min={MIN}
        max={maxRadiusMetres}
        step={STEP}
        value={radius}
        onChange={(e) => setRadius(Number(e.target.value))}
        disabled={isPending}
        className="mt-3 w-full accent-[#2563EB] disabled:opacity-50"
      />
      <div className="mt-1 flex justify-between text-[10px] text-[#A0A1A6]">
        <span>{formatMetres(MIN)}</span>
        <span>{formatMetres(maxRadiusMetres)}</span>
      </div>

      {dirty && (
        <button
          onClick={handleSave}
          disabled={isPending}
          className="mt-3 rounded-md bg-[#2563EB] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save radius'}
        </button>
      )}
      {justSaved && !dirty && (
        <p className="mt-3 text-xs font-medium text-green-700">Saved — territory re-fetched.</p>
      )}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </div>
  )
}
