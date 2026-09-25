'use client'

import { useState, useTransition } from 'react'
import { addTrackedArea } from './actions'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import PlaceInput from '@/components/ui/PlaceInput'
import { Alert } from '@/components/ui/ErrorState'

// Same look as the shared Input, which PlaceInput cannot reuse directly — it
// renders its own <input> so it can own the combobox wiring.
const PLACE_INPUT =
  'w-full rounded-sm border bg-surface px-3 py-2 text-sm text-ink placeholder:text-neutral-500 ' +
  'transition-[border-color,box-shadow] duration-fast ease-standard focus:outline-none ' +
  'border-border-control hover:border-primary-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/15'

export default function AddAreaForm() {
  const [error, setError] = useState<string | null>(null)
  const [location, setLocation] = useState('')
  const [label, setLabel] = useState('')
  // True once the person has typed their own label, so picking a place does
  // not overwrite it.
  const [labelEdited, setLabelEdited] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await addTrackedArea(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      setLocation('')
      setLabel('')
      setLabelEdited(false)
    })
  }

  return (
    <div className="rounded-md border border-border bg-surface p-5 sm:p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-ink">Add a territory to track</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Type a town, city or postcode &mdash; we&rsquo;ll work out the planning authority.
      </p>

      <form action={handleSubmit} className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start">
        <Field label="Town, city or postcode" required className="flex-1">
          {(p) => (
            <PlaceInput
              id={p.id}
              aria-describedby={p['aria-describedby']}
              // The field name stays "postcode" — the server action reads it
              // as either, and nothing else needs to change.
              name="postcode"
              required
              placeholder="e.g. Stoke-on-Trent or SW1A 1AA"
              value={location}
              onChange={setLocation}
              onSelect={(place) => {
                if (place && !labelEdited) setLabel(place.name)
              }}
              hiddenFields
              className={PLACE_INPUT}
            />
          )}
        </Field>

        <Field label="Label" hint="How you'll recognise it in your list." className="flex-1">
          {(p) => (
            <Input
              {...p}
              name="label"
              type="text"
              placeholder="e.g. Midlands Patch"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value)
                setLabelEdited(e.target.value.trim() !== '')
              }}
            />
          )}
        </Field>

        {/* Aligned to the inputs rather than their labels, and pushed clear of
            the hint line so the row doesn't jump when a validation message
            appears under either field. */}
        <Button
          type="submit"
          loading={isPending}
          loadingLabel="Adding territory"
          className="sm:mt-[26px]"
        >
          Add territory
        </Button>
      </form>

      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}
    </div>
  )
}
