'use client'

// Last-resort boundary: catches failures in the root layout itself, which the
// per-route error.tsx files can't reach. It renders its own <html>/<body>, so
// it deliberately uses inline styles — if the root layout failed, the stylesheet
// and fonts it pulls in may not be there either.

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Root layout error:', error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem',
          background: '#ffffff',
          color: '#202124',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <main style={{ maxWidth: '30rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
            PlanningPing didn’t start
          </h1>
          <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', lineHeight: 1.65, color: '#6b6c70' }}>
            The app failed to load before it could render anything. Reloading usually
            clears it. Your account and tracked territories are unaffected.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              padding: '0.625rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#ffffff',
              background: '#2563eb',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  )
}
