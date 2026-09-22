// Stable identities for data sources, so health baselines accumulate against
// the same key run after run.
//
// A territory's postcode is stored however the user typed it, and 'ST104AJ'
// and 'ST10 4AJ' are the same place — PlanIt normalises both to one query. Keyed
// on the raw string they were two sources with two baselines and two identical
// PlanIt requests every morning.
//
// Free of runtime imports so it can be tested with node --test.

export function normalisePostcodeKey(postcode: string): string {
  const compact = postcode.replace(/\s+/g, '').toUpperCase()
  if (compact.length < 5) return compact
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`
}

export function areaSourceKey(postcode: string, radiusKm: number): string {
  return `planit:area:${normalisePostcodeKey(postcode)}@${radiusKm}`
}

export function authoritySourceKey(councilSlug: string): string {
  return `planit:authority:${councilSlug}`
}

export function isAuthoritySource(sourceKey: string): boolean {
  return sourceKey.startsWith('planit:authority:')
}
