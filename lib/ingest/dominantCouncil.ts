// Which authority does a set of applications actually belong to?
//
// A territory's council is guessed from its postcode, but PlanIt files
// applications under whatever the council publishes as — sometimes an
// authority abolished years ago. The dashboard selects by the territory's
// council, so when the two disagree the territory shows nothing at all.
// Asking the results which authority they came from settles it without anyone
// maintaining a list of council mergers.
//
// A radius search near a boundary genuinely spans two or three authorities, so
// this is a majority vote rather than "whichever arrived first". Ties break
// alphabetically, purely so the answer is stable: the same inputs must not
// move a territory back and forth between councils on consecutive fetches.
//
// Free of runtime imports so it can be tested with node --test.

export function dominantCouncil(slugs: string[]): string | null {
  if (slugs.length === 0) return null
  const tally = new Map<string, number>()
  for (const slug of slugs) {
    if (!slug) continue
    tally.set(slug, (tally.get(slug) ?? 0) + 1)
  }
  if (tally.size === 0) return null
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}
