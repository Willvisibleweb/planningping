'use client'

import { useState, useTransition } from 'react'
import { addTrackedArea } from './actions'

export default function AddAreaForm() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await addTrackedArea(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="rounded-lg border border-[#D6E4FB] bg-white p-5 shadow-[0_1px_2px_rgba(32,33,36,.04)]">
      <h3 className="text-sm font-medium text-[#202124] mb-3">Add a territory to track</h3>
      <form action={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            name="postcode"
            type="text"
            placeholder="Postcode, e.g. SW1A 1AA"
            required
            className="w-full rounded-md border border-[#D6E4FB] px-3 py-2 text-sm text-[#202124] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40"
          />
        </div>
        <div className="flex-1">
          <input
            name="label"
            type="text"
            placeholder="Label, e.g. Midlands Patch, Client Site A"
            required
            className="w-full rounded-md border border-[#D6E4FB] px-3 py-2 text-sm text-[#202124] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50 whitespace-nowrap"
        >
          {isPending ? 'Adding…' : 'Add territory'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-[#A0A1A6]">
        We&rsquo;ll identify the planning authority for this postcode automatically.
      </p>
    </div>
  )
}
