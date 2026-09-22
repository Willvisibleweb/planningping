'use client'

import { useState, useTransition } from 'react'
import { Save, Target } from 'lucide-react'
import { saveOpportunityProfile } from './opportunityProfileActions'
import { SERVICE_OPTIONS, SECTOR_OPTIONS, STAGE_OPTIONS } from '@/lib/opportunities/profileOptions'
import Button from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Alert } from '@/components/ui/ErrorState'
import type { OpportunityProfile } from '@/types/database'

function CheckOption({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string
  value: string
  label: string
  defaultChecked: boolean
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-primary-300 hover:bg-primary-50/60">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="h-3.5 w-3.5 rounded border-border-control text-primary-500 focus:ring-primary-500"
      />
      {label}
    </label>
  )
}

export default function OpportunityProfileSection({
  profile,
  fallbackName,
}: {
  profile: OpportunityProfile | null
  fallbackName: string | null
}) {
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    setSaved(false)
    setError(null)
    startTransition(async () => {
      const result = await saveOpportunityProfile(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  const primary = new Set(profile?.primary_services ?? [])
  const secondary = new Set(profile?.secondary_services ?? [])
  const sectors = new Set(profile?.preferred_sectors ?? [])
  const stages = new Set(profile?.preferred_stages ?? [])

  return (
    <section id="opportunity-profile" className="rounded-md border border-border bg-surface p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-primary-50 text-primary-600 ring-1 ring-primary-200">
          <Target size={17} aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-ink">Improve your recommendations</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            PlanningPing uses this to rank opportunities for your company. Keep it broad;
            you can refine it as better leads come in.
          </p>
        </div>
      </div>

      <form action={onSubmit} className="mt-5 space-y-5">
        {profile?.id && <input type="hidden" name="id" value={profile.id} />}

        <Field label="Company or client name">
          {(p) => (
            <Input
              {...p}
              name="name"
              defaultValue={profile?.name ?? fallbackName ?? ''}
              placeholder="ABC Groundworks"
            />
          )}
        </Field>

        <div>
          <p className="text-sm font-medium text-ink">Primary services</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SERVICE_OPTIONS.map((option) => (
              <CheckOption
                key={option.value}
                name="primaryServices"
                value={option.value}
                label={option.label}
                defaultChecked={primary.has(option.value)}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-ink">Secondary services</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SERVICE_OPTIONS.map((option) => (
              <CheckOption
                key={option.value}
                name="secondaryServices"
                value={option.value}
                label={option.label}
                defaultChecked={secondary.has(option.value)}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Base location">
            {(p) => (
              <Input
                {...p}
                name="baseLocation"
                defaultValue={profile?.base_location ?? ''}
                placeholder="Alton, Hampshire"
              />
            )}
          </Field>
          <Field label="Operating radius" hint="Miles from your base, if useful.">
            {(p) => (
              <Input
                {...p}
                name="operatingRadiusMiles"
                type="number"
                min="1"
                step="1"
                defaultValue={profile?.operating_radius_miles ?? ''}
                placeholder="40"
              />
            )}
          </Field>
        </div>

        <Field label="Counties or regions covered">
          {(p) => (
            <Textarea
              {...p}
              name="regions"
              rows={2}
              defaultValue={profile?.regions ?? ''}
              placeholder="Hampshire, Surrey, Berkshire, West Sussex"
            />
          )}
        </Field>

        <div>
          <p className="text-sm font-medium text-ink">Preferred sectors</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SECTOR_OPTIONS.map((option) => (
              <CheckOption
                key={option.value}
                name="preferredSectors"
                value={option.value}
                label={option.label}
                defaultChecked={sectors.has(option.value)}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Residential units from">
            {(p) => (
              <Input
                {...p}
                name="minResidentialUnits"
                type="number"
                min="0"
                step="1"
                defaultValue={profile?.min_residential_units ?? ''}
                placeholder="20"
              />
            )}
          </Field>
          <Field label="Residential units up to">
            {(p) => (
              <Input
                {...p}
                name="maxResidentialUnits"
                type="number"
                min="0"
                step="1"
                defaultValue={profile?.max_residential_units ?? ''}
                placeholder="250"
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project value from">
            {(p) => (
              <Input
                {...p}
                name="minProjectSize"
                type="number"
                min="0"
                step="1000"
                defaultValue={profile?.min_project_size ?? ''}
                placeholder="250000"
              />
            )}
          </Field>
          <Field label="Project value up to">
            {(p) => (
              <Input
                {...p}
                name="maxProjectSize"
                type="number"
                min="0"
                step="1000"
                defaultValue={profile?.max_project_size ?? ''}
                placeholder="5000000"
              />
            )}
          </Field>
        </div>

        <Field label="Preferred project types">
          {(p) => (
            <Textarea
              {...p}
              name="preferredProjectTypes"
              rows={2}
              defaultValue={profile?.preferred_project_types ?? ''}
              placeholder="Estate roads, drainage schemes, enabling works, residential infrastructure"
            />
          )}
        </Field>

        <div>
          <p className="text-sm font-medium text-ink">Preferred timing</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {STAGE_OPTIONS.map((option) => (
              <CheckOption
                key={option.value}
                name="preferredStages"
                value={option.value}
                label={option.label}
                defaultChecked={stages.has(option.value)}
              />
            ))}
          </div>
        </div>

        <Field label="Typical package value">
          {(p) => (
            <Input
              {...p}
              name="typicalPackageValue"
              defaultValue={profile?.typical_package_value ?? ''}
              placeholder="Usually GBP 250k to GBP 1.5m"
            />
          )}
        </Field>

        <Field label="Work you do not want">
          {(p) => (
            <Textarea
              {...p}
              name="unwantedWork"
              rows={2}
              defaultValue={profile?.unwanted_work ?? ''}
              placeholder="Small householder extensions, domestic driveways, projects outside the South East"
            />
          )}
        </Field>

        <Field label="Preferred developers or main contractors">
          {(p) => (
            <Textarea
              {...p}
              name="preferredClients"
              rows={2}
              defaultValue={profile?.preferred_clients ?? ''}
              placeholder="Optional names or types of companies you like working with"
            />
          )}
        </Field>

        <Button type="submit" size="sm" loading={pending} loadingLabel="Saving profile">
          <Save size={14} aria-hidden="true" />
          Save recommendation profile
        </Button>
        {saved && <p className="text-xs font-medium text-success-600">Saved. Your opportunity scores now use this profile.</p>}
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </section>
  )
}
