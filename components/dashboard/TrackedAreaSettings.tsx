'use client'

// Per-territory relevance filter + email-alert opt-in. Same shape as
// RadiusControl (dirty-state, useTransition, Save button) but its own card —
// changing these doesn't need a PlanIt re-fetch, only radius does.

import { useState, useTransition } from 'react'
import { updateTrackedAreaSettings } from './actions'
import Button from '@/components/ui/Button'
import Pill from '@/components/ui/Pill'
import { Alert } from '@/components/ui/ErrorState'
import type { MinBand } from '@/types/database'
import Link from 'next/link'

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
    <div className="rounded-md border border-border bg-surface p-5 shadow-sm">
      <h3 className="text-sm font-medium text-ink">Relevance & alerts</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Applications are scored automatically — hide low-relevance noise like minor
        householder works from this territory.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {BAND_OPTIONS.map((opt) => (
          <Pill
            key={opt.value}
            selected={opt.value === minBand}
            onClick={() => setMinBand(opt.value)}
            disabled={isPending}
            title={opt.hint}
          >
            {opt.label}
          </Pill>
        ))}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        {hasProAccess ? (
          <label className="-m-2 flex cursor-pointer items-center gap-2.5 rounded-sm p-2 text-sm text-ink transition-colors duration-fast ease-standard hover:bg-primary-50/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-500/45">
            <input
              type="checkbox"
              checked={alertsEnabled}
              onChange={(e) => setAlertsEnabled(e.target.checked)}
              disabled={isPending}
              className="size-4 shrink-0 accent-primary-500 focus-visible:outline-none"
            />
            Email me when a new matching application appears
          </label>
        ) : (
          <div className="text-xs text-ink-muted">
            <span className="font-medium text-ink-muted">Email alerts</span> — a professional-plan
            feature.{' '}
            <Link href="/settings#billing" className="pp-link font-medium">
              Upgrade
            </Link>{' '}
            to get emailed when a new matching application appears.
          </div>
        )}
      </div>

      {dirty && (
        <Button size="sm" className="mt-4" onClick={handleSave} loading={isPending} loadingLabel="Saving settings">
          Save settings
        </Button>
      )}
      {justSaved && !dirty && (
        <p className="mt-4 text-xs font-medium text-success-600">Saved.</p>
      )}
      {error && (
        <Alert tone="danger" className="mt-4 text-xs">
          {error}
        </Alert>
      )}
    </div>
  )
}
