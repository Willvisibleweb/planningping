// Answer the scheduler immediately, then do the work.
//
// External cron services give up long before these jobs finish — cron-job.org
// cuts the connection at 30 seconds, and a single PlanIt source averages 18.6s,
// so even a modest batch overruns it. The work was completing fine; the caller
// just never saw the end of it and recorded a failure.
//
// next/server's `after` runs a callback once the response has been sent, and
// on Vercel the function stays alive for it up to the route's maxDuration. So
// the scheduler gets 202 in milliseconds and the job still gets its full
// budget.
//
// Background is the default because that is what every scheduled caller wants.
// Pass ?wait=1 to block until the work finishes and get the real result — used
// by the GitHub Actions workflow, which has no tight timeout and whose whole
// value is that a failure turns the run red, and by anyone running a job by
// hand who wants to see what it did.
//
// The trade-off, stated plainly: a background call reports only that the work
// was ACCEPTED. A scheduler watching these URLs can no longer tell you the
// ingest failed, because the answer is sent before the outcome is known. That
// is what /api/health/ingest is for — it is fast, needs no auth, and answers
// 503 when the pipeline is actually unhealthy. Point the uptime monitor there,
// not here.

import { after, NextResponse, type NextRequest } from 'next/server'

export interface BackgroundOptions {
  /** Name used in logs, e.g. 'ingest-work'. */
  job: string
}

/**
 * Run `work`, either synchronously (?wait=1) or after the response is sent.
 *
 * `work` returns the JSON body for the synchronous case. Throwing is fine: in
 * wait mode the error propagates to the caller, in background mode it is
 * logged, because by then the response has gone.
 */
export function respondInBackground<T>(
  request: NextRequest,
  { job }: BackgroundOptions,
  work: () => Promise<T>,
): Promise<NextResponse> | NextResponse {
  if (request.nextUrl.searchParams.get('wait') === '1') {
    return work().then((result) => NextResponse.json(result as object))
  }

  after(async () => {
    const startedAt = Date.now()
    try {
      const result = await work()
      console.log(JSON.stringify({ at: `cron.${job}`, mode: 'background', ms: Date.now() - startedAt, result }))
    } catch (e) {
      // Nothing to return this to — the response left long ago. The job's own
      // pipeline_events row is the durable record; this is for the log tail.
      console.error(JSON.stringify({ at: `cron.${job}`, mode: 'background', ms: Date.now() - startedAt, error: String(e) }))
    }
  })

  return NextResponse.json(
    {
      accepted: true,
      job,
      mode: 'background',
      startedAt: new Date().toISOString(),
      note: 'Work continues after this response. Add ?wait=1 to block for the result, or watch /api/health/ingest for pipeline health.',
    },
    { status: 202 },
  )
}

/** Shared bearer-token check for every cron route. */
export function isAuthorisedCron(request: NextRequest): boolean {
  return request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}
