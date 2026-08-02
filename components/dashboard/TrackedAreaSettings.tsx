'use client'

// Per-territory relevance filter + email-alert opt-in. Same shape as
// RadiusControl (dirty-state, useTransition, Save button) but its own card —
// changing these doesn't need a PlanIt re-fetch, only radius does.

import { useState, useTransition } from 'react'
import { updateTrackedAreaSettings } from './actions'
import type { MinBand } from '@/types/database'

const BAND_OPTIONS: { value: MinBand; label: string; hint: string }[] = [
  { value: 'ALL', label: 'All', hint: 'Show every application' },
  { value: 'WARM_PLUS', label: 'Warm & Hot', hint: 'Hide low-relevance noise' },
  { value: 'HOT_ONLY', label: 'Hot only', hint: 'Strongest civils signal only' },
]

export default function TrackedAreaSettings({
  areaId,
  initialMinBand,
  initialAlertsEnabled,
  hasProAccess,
}: {
  areaId: string
  initialMinBand: MinBand
  initialAlertsEnabled: boolean
  hasProAccess: boolean
}) {
  const [minBand, setMinBand] = useState<MinBand>(initialMinBand)
  const [alertsEnabled, setAlertsEnabled] = useState(initialAlertsEnabled)
  const [saved, setSaved] = useState({ minBand: initialMinBand, alertsEnabled: initialAlertsEnabled })
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const dirty = minBand !== saved.minBand || alertsEnabled !== saved.alertsEnabled

  function handleSave() {
    setError(null)
    setJustSaved(false)
    startTransition(async () => {
      const result = await updateTrackedAreaSettings(areaId, { minBand, alertsEnabled })
      if (result?.error) {
        setError(result.error)
        return
      }
      setSaved({ minBand, alertsEnabled })
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2500)
    })
  }

  return (
    <div className="rounded-lg border border-[#D6E4FB] bg-white p-4">
      <h3 className="text-sm font-medium text-[#202124]">Relevance & alerts</h3>
      <p className="mt-1 text-xs text-[#A0A1A6]">
        Applications are scored automatically — hide low-relevance noise like minor
        householder works from this territory.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {BAND_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setMinBand(opt.value)}
            disabled={isPending}
            title={opt.hint}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
              opt.value === minBand
                ? 'border-[#2563EB] bg-[#2563EB] text-white'
                : 'border-[#D6E4FB] bg-white text-[#6B6C70] hover:border-[#2563EB]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="mt-4 border-t border-[#E9F0FD] pt-3">
        {hasProAccess ? (
          <label className="flex items-center gap-2 text-sm text-[#202124]">
            <input
              type="checkbox"
              checked={alertsEnabled}
              onChange={(e) => setAlertsEnabled(e.target.checked)}
              disabled={isPending}
              className="h-4 w-4 accent-[#2563EB]"
            />
            Email me when a new matching application appears
          </label>
        ) : (
          <div className="text-xs text-[#A0A1A6]">
            <span className="font-medium text-[#6B6C70]">Email alerts</span> — a professional-plan
            feature.{' '}
            <a href="/settings#billing" className="font-medium text-[#2563EB] hover:underline">
              Upgrade
            </a>{' '}
            to get emailed when a new matching application appears.
          </div>
        )}
      </div>

      {dirty && (
        <button
          onClick={handleSave}
          disabled={isPending}
          className="mt-3 rounded-md bg-[#2563EB] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save settings'}
        </button>
      )}
      {justSaved && !dirty && <p className="mt-3 text-xs font-medium text-green-700">Saved.</p>}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </div>
  )
}
