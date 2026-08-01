'use client'

import { useState, useTransition } from 'react'
import { updateTrackedAreaRadius } from './actions'

const MIN = 250
const MAX = 5000
const STEP = 250

function formatMetres(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}km` : `${m}m`
}

export default function RadiusControl({
  areaId,
  initialRadiusMetres,
}: {
  areaId: string
  initialRadiusMetres: number
}) {
  const [radius, setRadius] = useState(initialRadiusMetres)
  const [saved, setSaved] = useState(initialRadiusMetres)
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
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">Tracking radius</h3>
        <span className="font-mono text-sm text-gray-500">{formatMetres(radius)}</span>
      </div>
      <p className="mt-1 text-xs text-gray-400">
        How far from the postcode to pull planning applications from.
      </p>
      <input
        type="range"
        min={MIN}
        max={MAX}
        step={STEP}
        value={radius}
        onChange={(e) => setRadius(Number(e.target.value))}
        disabled={isPending}
        className="mt-3 w-full accent-[#2563EB] disabled:opacity-50"
      />
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>{formatMetres(MIN)}</span>
        <span>{formatMetres(MAX)}</span>
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
