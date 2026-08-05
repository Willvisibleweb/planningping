'use client'

import { useState, useTransition } from 'react'
import { addTrackedArea } from './actions'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/ErrorState'

// Loose UK postcode shape — deliberately permissive. This only catches obvious
// typos before a round trip; the server action stays the authority on whether
// a postcode actually resolves to a planning authority.
const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i

export default function AddAreaForm() {
  const [error, setError] = useState<string | null>(null)
  const [postcode, setPostcode] = useState('')
  const [postcodeError, setPostcodeError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await addTrackedArea(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="rounded-md border border-border bg-surface p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-ink">Add a territory to track</h3>
      <p className="mt-1 text-xs text-ink-muted">
        We&rsquo;ll identify the planning authority for this postcode automatically.
      </p>

      <form action={handleSubmit} className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start">
        <Field
          label="Postcode"
          required
          error={postcodeError}
          className="flex-1"
        >
          {(p) => (
            <Input
              {...p}
              name="postcode"
              type="text"
              required
              placeholder="e.g. SW1A 1AA"
              autoComplete="postal-code"
              value={postcode}
              onChange={(e) => {
                setPostcode(e.target.value)
                if (postcodeError) setPostcodeError(null)
              }}
              // Checked on blur, not per keystroke — every partially typed
              // postcode is invalid, and saying so while someone types is
              // nagging rather than helping.
              onBlur={() =>
                setPostcodeError(
                  postcode.trim() && !UK_POSTCODE.test(postcode.trim())
                    ? 'That doesn’t look like a UK postcode. Try the full code, e.g. SW1A 1AA.'
                    : null,
                )
              }
            />
          )}
        </Field>

        <Field label="Label" required hint="How you'll recognise it in your list." className="flex-1">
          {(p) => (
            <Input {...p} name="label" type="text" required placeholder="e.g. Midlands Patch" />
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
