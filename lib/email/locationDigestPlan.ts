// The decisions the location digest makes, with no database in them.
//
// Which week it covers, and which applications are worth putting in front of
// someone who has not signed up for anything except this email. Kept separate
// so both are testable, because getting either wrong is invisible until a real
// person receives a bad email.
//
// Free of runtime imports so it can be tested with node --test.

export interface LocationKey {
  type: 'council' | 'postcode' | 'town'
  slug: string
}

/**
 * The seven whole days ending yesterday.
 *
 * Whole days on purpose: run on a Monday it covers last Monday to Sunday, and
 * running it twice the same day cannot shift the window or count an
 * application into two issues. Today is excluded because today is not over,
 * and a subscriber should not get half a day now and the other half next week.
 */
export function locationWindow(now: Date): { start: string; end: string } {
  const endDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  endDay.setUTCDate(endDay.getUTCDate() - 1)
  const startDay = new Date(endDay)
  startDay.setUTCDate(startDay.getUTCDate() - 6)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { start: iso(startDay), end: iso(endDay) }
}

/**
 * Is this application worth including?
 *
 * HOT and WARM only. The page promised applications "scored for civils scope —
 * drainage, highways, groundworks and structures", and COLD is precisely what
 * the scoring rejected as householder extensions, tree works and non-build
 * consents. Sending those would make the email exactly the noise the product
 * exists to remove — and the recipient is a stranger deciding on one email
 * whether we are worth listening to.
 *
 * An unscored application is excluded too: we cannot claim it was scored.
 */
export function relevantForDigest(band: string | null): boolean {
  return band === 'HOT' || band === 'WARM'
}
