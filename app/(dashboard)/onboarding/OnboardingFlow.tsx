'use client'

// First-run setup: five short questions, then a working dashboard.
//
// The answers are not just stored — each one changes what the user sees:
//   business type        → profiles.sector (steers defaults and copy)
//   company + work       → opportunity profile services: matches that fit
//                          what they do rank higher, mismatches lower
//   project types + size → preferred sectors and residential unit range
//   timing               → preferred stages, a nudge in the match score
//   alerts               → the first territory's email filter
//   location + radius    → the first territory, fetched immediately
// Steps 2–4 write the same opportunity profile the Settings form edits, so
// Settings open pre-filled and the first dashboard is already ranked for them.
//
// Deliberately skippable at every step. An onboarding you cannot get out of is
// a wall, and someone who signed up to look around should be allowed to look
// around. Nothing here gates access to anything.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LocateFixed, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import { SECTORS } from '@/lib/sectors'
import {
  ALERT_CHOICES,
  SECTOR_OPTIONS,
  SERVICE_OPTIONS,
  SIZE_PRESETS,
  TIMING_CHOICES,
  sizePresetFor,
  timingChoicesFor,
  type AlertChoice,
  type SizePreset,
  type TimingChoice,
} from '@/lib/opportunities/profileOptions'
import { saveSector, saveOnboardingProfile, postcodeFromCoords } from './actions'
import { addTrackedArea } from '@/components/dashboard/actions'
import Button from '@/components/ui/Button'
import PlaceInput from '@/components/ui/PlaceInput'
import type { PlaceSuggestion } from '@/lib/places'
import { useToast } from '@/components/ui/Toast'
import type { OpportunityProfile } from '@/types/database'

type Step = 1 | 2 | 3 | 4 | 5
const STEPS: Step[] = [1, 2, 3, 4, 5]

const INPUT =
  'w-full rounded-sm border border-border-control bg-surface px-3 py-2 text-sm text-ink placeholder:text-neutral-500 transition-[border-color,box-shadow] duration-fast ease-standard hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2'

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-2 text-sm font-medium transition-colors duration-fast ease-standard ${FOCUS} ${
        selected ? 'border-primary-500 bg-primary-50 text-primary-800 ring-1 ring-primary-500' : 'border-border text-ink hover:border-primary-300 hover:bg-primary-50/50'
      }`}
    >
      {selected && <Check size={13} className="shrink-0 text-primary-600" aria-hidden="true" />}
      {children}
    </button>
  )
}

function Choice({
  selected,
  onClick,
  label,
  hint,
  multi = false,
}: {
  selected: boolean
  onClick: () => void
  label: string
  hint?: string
  multi?: boolean
}) {
  return (
    <button
      type="button"
      role={multi ? undefined : 'radio'}
      aria-checked={multi ? undefined : selected}
      aria-pressed={multi ? selected : undefined}
      onClick={onClick}
      className={`block w-full rounded-sm border p-3.5 text-left transition-[background-color,border-color] duration-fast ease-standard ${FOCUS} ${
        selected ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500' : 'border-border hover:border-primary-300 hover:bg-primary-50/50'
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">{label}</span>
        {selected && <Check size={15} className="shrink-0 text-primary-500" aria-hidden="true" />}
      </span>
      {hint && <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{hint}</span>}
    </button>
  )
}

function StepHeader({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
    </>
  )
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function formatRadius(metres: number): string {
  return metres >= 1000 ? `${metres / 1000} km` : `${metres} m`
}

export default function OnboardingFlow({
  initialSector,
  initialProfile,
  maxRadiusMetres,
  canAlert,
}: {
  initialSector: string | null
  initialProfile: Pick<
    OpportunityProfile,
    'name' | 'primary_services' | 'preferred_sectors' | 'min_residential_units' | 'max_residential_units' | 'preferred_stages'
  > | null
  maxRadiusMetres: number
  canAlert: boolean
}) {
  const [step, setStep] = useState<Step>(1)
  const [sector, setSector] = useState<string | null>(initialSector)
  const [companyName, setCompanyName] = useState(initialProfile?.name && initialProfile.name !== 'My company' ? initialProfile.name : '')
  const [services, setServices] = useState<string[]>(initialProfile?.primary_services ?? [])
  const [projectSectors, setProjectSectors] = useState<string[]>(initialProfile?.preferred_sectors ?? [])
  const [size, setSize] = useState<SizePreset>(
    sizePresetFor(initialProfile?.min_residential_units ?? null, initialProfile?.max_residential_units ?? null),
  )
  const [timing, setTiming] = useState<TimingChoice[]>(timingChoicesFor(initialProfile?.preferred_stages ?? []))
  const [alerts, setAlerts] = useState<AlertChoice>(canAlert ? 'WARM_PLUS' : 'OFF')

  const radiusOptions = [1000, 3000, 5000].filter((r) => r <= maxRadiusMetres)
  const radii = radiusOptions.length > 0 ? radiusOptions : [maxRadiusMetres]
  const [radius, setRadius] = useState<number>(radii.includes(3000) ? 3000 : radii[radii.length - 1])
  const [postcode, setPostcode] = useState('')
  const [place, setPlace] = useState<PlaceSuggestion | null>(null)
  const [label, setLabel] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [isPending, startTransition] = useTransition()

  const router = useRouter()
  const { toast } = useToast()

  function chooseSector(code: string) {
    setSector(code)
    // Saved immediately rather than at the end. The answer is useful even if
    // the user abandons later, and a failure here must not stop them.
    startTransition(async () => {
      await saveSector(code)
      setStep(2)
    })
  }

  // Steps 2–4 are saved together on leaving step 4, so an answer is never
  // written half-formed, and still saved if the location step is abandoned.
  function finishPreferences() {
    setError(null)
    startTransition(async () => {
      const result = await saveOnboardingProfile({
        companyName,
        services,
        sectors: projectSectors,
        size,
        timing,
      })
      if (result?.error) {
        toast({ title: 'Answers not saved', description: result.error, variant: 'error' })
      }
      setStep(5)
    })
  }

  function useMyLocation() {
    setError(null)
    if (!navigator.geolocation) {
      setError('Your browser will not share a location. Enter a town or postcode instead.')
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        startTransition(async () => {
          const result = await postcodeFromCoords(pos.coords.latitude, pos.coords.longitude)
          setLocating(false)
          if (!result.ok) {
            setError(result.error)
            return
          }
          setPostcode(result.postcode)
          setPlace(null)
          // Only prefill a label if the user hasn't written one — typing a name
          // and then having it overwritten by a button press is maddening.
          setLabel((current) => current || 'My area')
        })
      },
      () => {
        setLocating(false)
        setError('Could not get your location. Enter a town or postcode instead.')
      },
      { timeout: 10_000, maximumAge: 60_000 },
    )
  }

  function submitArea() {
    setError(null)
    const trimmed = postcode.trim()
    if (!trimmed) {
      setError('Enter a town or postcode, or use your location.')
      return
    }

    startTransition(async () => {
      const form = new FormData()
      form.set('postcode', trimmed)
      if (place) {
        form.set('place_lat', String(place.lat))
        form.set('place_lng', String(place.lng))
        form.set('place_name', place.name)
      }
      form.set('label', label.trim() || place?.name || 'My area')
      form.set('radius_metres', String(radius))
      if (alerts !== 'OFF') form.set('min_band', alerts)
      form.set('alerts_enabled', String(alerts !== 'OFF'))

      const result = await addTrackedArea(form)
      if (result?.error) {
        setError(result.error)
        return
      }
      toast({
        title: 'Territory added',
        description: 'Finding what has been published near you, ranked for your business.',
        variant: 'success',
      })
      router.push('/dashboard')
    })
  }

  const back = (to: Step) => (
    <button
      type="button"
      onClick={() => setStep(to)}
      className={`inline-flex items-center gap-1 rounded-sm text-xs font-medium text-ink-muted transition-colors duration-fast ease-standard hover:text-ink ${FOCUS}`}
    >
      <ArrowLeft size={13} aria-hidden="true" /> Back
    </button>
  )

  const footer = (onBack: Step, onNext: () => void, nextLabel = 'Continue') => (
    <div className="mt-8 flex items-center justify-between gap-3">
      {back(onBack)}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onNext}
          disabled={isPending}
          className={`rounded-sm text-xs font-medium text-ink-muted transition-colors duration-fast ease-standard hover:text-ink disabled:opacity-50 ${FOCUS}`}
        >
          Skip
        </button>
        <Button onClick={onNext} loading={isPending} loadingLabel="Saving">
          {nextLabel}
          <ArrowRight size={14} aria-hidden="true" />
        </Button>
      </div>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="mb-2 flex items-center gap-2" aria-hidden="true">
        {STEPS.map((n) => (
          <span
            key={n}
            className={`h-1 flex-1 rounded-full transition-colors duration-slow ease-standard ${step >= n ? 'bg-primary-500' : 'bg-neutral-200'}`}
          />
        ))}
      </div>
      <p className="mb-8 text-xs text-ink-muted">Step {step} of {STEPS.length}</p>

      {step === 1 && (
        <div>
          <StepHeader
            title="What does your business do?"
            body="The same planning application matters for different reasons depending on what you sell. This shapes what we put in front of you."
          />
          <div className="mt-6 space-y-2">
            {SECTORS.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => chooseSector(s.code)}
                disabled={isPending}
                className={`block w-full rounded-sm border p-4 text-left transition-[background-color,border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:border-primary-300 hover:bg-primary-50/50 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS} ${
                  sector === s.code ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500' : 'border-border'
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">{s.label}</span>
                  {sector === s.code && <Check size={15} className="shrink-0 text-primary-500" aria-hidden="true" />}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{s.hint}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => chooseSector('other')}
            disabled={isPending}
            className={`mt-4 rounded-sm text-xs font-medium text-ink-muted transition-colors duration-fast ease-standard hover:text-ink disabled:opacity-50 ${FOCUS}`}
          >
            None of these fit my business &rarr;
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <StepHeader
            title="What work do you want to win?"
            body="Pick everything you do. Applications that need this work are ranked higher for you, and ones that clearly do not are ranked lower."
          />
          <div className="mt-6">
            <label htmlFor="ob-company" className="block text-sm font-medium text-ink">
              Company name <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <input
              id="ob-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="ABC Groundworks Ltd"
              autoComplete="organization"
              className={`mt-1.5 ${INPUT}`}
            />
          </div>
          <p className="mt-5 text-sm font-medium text-ink">Kinds of work</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SERVICE_OPTIONS.map((o) => (
              <Chip key={o.value} selected={services.includes(o.value)} onClick={() => setServices((s) => toggle(s, o.value))}>
                {o.label}
              </Chip>
            ))}
          </div>
          {footer(1, () => setStep(3))}
        </div>
      )}

      {step === 3 && (
        <div>
          <StepHeader
            title="What kind of projects suit you?"
            body="We use these to favour schemes you would actually bid for. Leave them blank and nothing is filtered out."
          />
          <p className="mt-6 text-sm font-medium text-ink">Project types</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SECTOR_OPTIONS.map((o) => (
              <Chip key={o.value} selected={projectSectors.includes(o.value)} onClick={() => setProjectSectors((s) => toggle(s, o.value))}>
                {o.label}
              </Chip>
            ))}
          </div>
          <p className="mt-6 text-sm font-medium text-ink">Size of housing scheme</p>
          <p className="mt-0.5 text-xs text-ink-muted">Applied when a description states the number of homes.</p>
          <div role="radiogroup" aria-label="Size of housing scheme" className="mt-2 grid gap-2 sm:grid-cols-2">
            {SIZE_PRESETS.map((p) => (
              <Choice key={p.value} selected={size === p.value} onClick={() => setSize(p.value)} label={p.label} hint={p.hint} />
            ))}
          </div>
          {footer(2, () => setStep(4))}
        </div>
      )}

      {step === 4 && (
        <div>
          <StepHeader
            title="When do you want to hear about a project?"
            body="Pick any that apply. Projects at these stages are nudged up your recommendations."
          />
          <div className="mt-6 space-y-2">
            {TIMING_CHOICES.map((c) => (
              <Choice key={c.value} multi selected={timing.includes(c.value)} onClick={() => setTiming((t) => toggle(t, c.value))} label={c.label} hint={c.hint} />
            ))}
          </div>
          {canAlert && (
            <>
              <p className="mt-6 text-sm font-medium text-ink">Which new applications should we email you about?</p>
              <div role="radiogroup" aria-label="Email alerts" className="mt-2 grid gap-2 sm:grid-cols-2">
                {ALERT_CHOICES.map((c) => (
                  <Choice key={c.value} selected={alerts === c.value} onClick={() => setAlerts(c.value)} label={c.label} hint={c.hint} />
                ))}
              </div>
            </>
          )}
          {footer(3, finishPreferences)}
        </div>
      )}

      {step === 5 && (
        <div>
          <StepHeader
            title="Where do you work?"
            body="A town, city or postcode is enough — we work out which planning authority covers it. You can add more areas later."
          />
          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="ob-postcode" className="block text-sm font-medium text-ink">Town, city or postcode</label>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <PlaceInput
                  id="ob-postcode"
                  value={postcode}
                  onChange={setPostcode}
                  onSelect={setPlace}
                  placeholder="e.g. Leek or ST13 5RS"
                  wrapperClassName="flex-1"
                  className={INPUT}
                />
                <Button type="button" variant="secondary" onClick={useMyLocation} loading={locating} loadingLabel="Finding you" className="shrink-0">
                  <LocateFixed size={14} aria-hidden="true" />
                  Use my location
                </Button>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-ink">How far around it?</p>
              <div role="radiogroup" aria-label="Search radius" className="mt-2 flex flex-wrap gap-2">
                {radii.map((r) => (
                  <Chip key={r} selected={radius === r} onClick={() => setRadius(r)}>
                    {formatRadius(r)}
                  </Chip>
                ))}
              </div>
              {maxRadiusMetres < 5000 && (
                <p className="mt-1.5 text-xs text-ink-muted">Your plan covers up to {formatRadius(maxRadiusMetres)}.</p>
              )}
            </div>

            <div>
              <label htmlFor="ob-label" className="block text-sm font-medium text-ink">
                Name it <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <input id="ob-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Head office" className={`mt-1.5 ${INPUT}`} />
            </div>
          </div>

          {error && <p className="mt-3 rounded-sm bg-danger-50 px-3 py-2 text-sm text-danger-600">{error}</p>}

          <div className="mt-8 flex items-center justify-between gap-3">
            {back(4)}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className={`rounded-sm text-xs font-medium text-ink-muted transition-colors duration-fast ease-standard hover:text-ink ${FOCUS}`}
              >
                Skip for now
              </button>
              <Button onClick={submitArea} loading={isPending} loadingLabel="Setting up">
                Show me what&rsquo;s there
                <ArrowRight size={14} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
