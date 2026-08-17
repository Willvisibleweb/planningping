'use client'

// Two questions, then a working dashboard.
//
// Before this, a new account landed on an empty dashboard holding a form and no
// explanation — the worst moment in the product, at the moment a user has the
// least patience for it. Asking what they do and where they work takes about
// fifteen seconds and means the first screen they see has real applications on
// it rather than an empty state.
//
// Deliberately skippable at both steps. An onboarding you cannot get out of is
// a wall, and someone who signed up to look around should be allowed to look
// around. Nothing here gates access to anything.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LocateFixed, ArrowRight, Check } from 'lucide-react'
import { SECTORS } from '@/lib/sectors'
import { saveSector, postcodeFromCoords } from './actions'
import { addTrackedArea } from '@/components/dashboard/actions'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

export default function OnboardingFlow() {
  const [step, setStep] = useState<1 | 2>(1)
  const [sector, setSector] = useState<string | null>(null)
  const [postcode, setPostcode] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [isPending, startTransition] = useTransition()

  const router = useRouter()
  const { toast } = useToast()

  function chooseSector(code: string) {
    setSector(code)
    // Saved immediately rather than at the end. The answer is useful even if
    // the user abandons at the postcode step, and a failure here must not stop
    // them — the sector steers defaults, it does not gate anything.
    startTransition(async () => {
      await saveSector(code)
      setStep(2)
    })
  }

  function useMyLocation() {
    setError(null)
    if (!navigator.geolocation) {
      setError('Your browser will not share a location. Enter a postcode instead.')
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
          // Only prefill a label if the user hasn't written one — typing a name
          // and then having it overwritten by a button press is maddening.
          setLabel((current) => current || 'My area')
        })
      },
      () => {
        setLocating(false)
        // Covers a denied permission and a timeout alike. The distinction does
        // not change what the user does next, which is type a postcode.
        setError('Could not get your location. Enter a postcode instead.')
      },
      { timeout: 10_000, maximumAge: 60_000 },
    )
  }

  function submitArea() {
    setError(null)
    const trimmed = postcode.trim()
    if (!trimmed) {
      setError('Enter a postcode, or use your location.')
      return
    }

    startTransition(async () => {
      const form = new FormData()
      form.set('postcode', trimmed)
      form.set('label', label.trim() || 'My area')

      const result = await addTrackedArea(form)
      if (result?.error) {
        setError(result.error)
        return
      }
      toast({
        title: 'Territory added',
        description: 'Finding what has been published near you.',
        variant: 'success',
      })
      router.push('/dashboard')
    })
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      {/* Two dots rather than a progress bar: with two steps a bar is mostly
          decoration, and this still says "there is an end to this". */}
      <div className="mb-8 flex items-center gap-2">
        {[1, 2].map((n) => (
          <span
            key={n}
            aria-hidden="true"
            className={`h-1 flex-1 rounded-full transition-colors duration-slow ease-standard ${
              step >= n ? 'bg-primary-500' : 'bg-neutral-200'
            }`}
          />
        ))}
      </div>

      {step === 1 ? (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            What does your business do?
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            The same planning application matters for different reasons depending
            on what you sell. This shapes what we put in front of you.
          </p>

          <div className="mt-6 space-y-2">
            {SECTORS.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => chooseSector(s.code)}
                disabled={isPending}
                className={`block w-full rounded-sm border p-4 text-left transition-[background-color,border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:border-primary-300 hover:bg-primary-50/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                  sector === s.code
                    ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                    : 'border-border'
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">{s.label}</span>
                  {sector === s.code && (
                    <Check size={15} className="shrink-0 text-primary-500" aria-hidden="true" />
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                  {s.hint}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => chooseSector('other')}
            disabled={isPending}
            className="mt-4 rounded-sm text-xs font-medium text-ink-muted transition-colors duration-fast ease-standard hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            None of these fit my business &rarr;
          </button>
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Where do you work?
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            A postcode is enough — we work out which planning authority covers it.
            You can change the radius and add more areas later.
          </p>

          <div className="mt-6 space-y-3">
            <div>
              <label htmlFor="ob-postcode" className="block text-sm font-medium text-ink">
                Postcode
              </label>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <input
                  id="ob-postcode"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                  placeholder="ST13 5RS"
                  autoComplete="postal-code"
                  className="tabular-data w-full rounded-sm border border-border-control bg-surface px-3 py-2 text-sm text-ink placeholder:text-neutral-500 transition-[border-color,box-shadow] duration-fast ease-standard hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={useMyLocation}
                  loading={locating}
                  loadingLabel="Finding you"
                  className="shrink-0"
                >
                  <LocateFixed size={14} aria-hidden="true" />
                  Use my location
                </Button>
              </div>
            </div>

            <div>
              <label htmlFor="ob-label" className="block text-sm font-medium text-ink">
                Name it <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <input
                id="ob-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Head office"
                className="mt-1.5 w-full rounded-sm border border-border-control bg-surface px-3 py-2 text-sm text-ink placeholder:text-neutral-500 transition-[border-color,box-shadow] duration-fast ease-standard hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15"
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-sm bg-danger-50 px-3 py-2 text-sm text-danger-600">
              {error}
            </p>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="rounded-sm text-xs font-medium text-ink-muted transition-colors duration-fast ease-standard hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
            >
              Skip for now
            </button>
            <Button onClick={submitArea} loading={isPending} loadingLabel="Setting up">
              Show me what&rsquo;s there
              <ArrowRight size={14} aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
