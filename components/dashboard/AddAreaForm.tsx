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
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-medium text-gray-900 mb-3">Add an area to monitor</h3>
      <form action={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            name="postcode"
            type="text"
            placeholder="Postcode, e.g. SW1A 1AA"
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1">
          <input
            name="label"
            type="text"
            placeholder="Label, e.g. Home, Office"
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
        >
          {isPending ? 'Adding…' : 'Add area'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-gray-400">
        We'll look up which council covers this postcode automatically.
      </p>
    </div>
  )
}
