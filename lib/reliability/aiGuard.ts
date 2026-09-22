// Guards on AI output before it is shown or stored.
//
// The failure that matters most is a model turning a vague description into a
// confident figure: "a modest extension" becoming "a £4.2m scheme", or "new
// dwellings" becoming "40 homes". Prompts forbid it; this checks it. Every
// money amount, count-with-a-unit and percentage in the output must have its
// number present somewhere in the source text the model was given. If not,
// the output is treated as unsupported and is not saved.
//
// It is deliberately a blunt instrument: a number is "supported" if it appears
// in the source at all, so it can miss a real number used in the wrong place.
// It catches invention, not misquotation. Numbers written as words ("forty")
// are not detected.
//
// Free of runtime imports so it can be tested with node --test.

const UNITS =
  '(?:homes?|houses?|dwellings?|units?|flats?|apartments?|bedrooms?|beds?|storeys?|stories|floors?|' +
  'hectares?|ha|acres?|sq\\.?\\s?m|sqm|m2|m²|square\\s+(?:metres?|meters?|feet)|sq\\.?\\s?ft|' +
  'metres?|meters?|spaces?|jobs?|rooms?|pitches?|plots?|lots?|trees?)'
const TIME_UNITS = '(?:days?|weeks?|months?|years?)'

const MONEY = /£\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|bn|million|billion|thousand)?\b/gi
const COUNT = new RegExp(`\\b\\d[\\d,]*(?:\\.\\d+)?\\s?-?${UNITS}\\b`, 'gi')
const DURATION = new RegExp(`\\b\\d[\\d,]*(?:\\.\\d+)?\\s?-?${TIME_UNITS}\\b`, 'gi')
const PERCENT = /\b\d+(?:\.\d+)?\s?%/g

export type FigureKind = 'money' | 'count' | 'duration' | 'percent'
const PATTERNS: Record<FigureKind, RegExp> = { money: MONEY, count: COUNT, duration: DURATION, percent: PERCENT }
const ALL_KINDS: FigureKind[] = ['money', 'count', 'duration', 'percent']

export function extractFigures(text: string, kinds: FigureKind[] = ALL_KINDS): string[] {
  const found = new Set<string>()
  for (const kind of kinds) {
    for (const m of text.matchAll(PATTERNS[kind])) found.add(m[0].trim())
  }
  return [...found]
}

function numberOf(figure: string): string | null {
  const m = /\d[\d,]*(?:\.\d+)?/.exec(figure)
  return m ? m[0].replace(/,/g, '') : null
}

function sourceHasNumber(sources: string[], num: string): boolean {
  const escaped = num.replace(/\./g, '\\.')
  const pattern = new RegExp(`(^|[^\\d.])${escaped}(?![\\d])`)
  return sources.some((s) => pattern.test(s.replace(/(\d),(?=\d{3}\b)/g, '$1')))
}

/** Figures in the output whose number does not appear in any source text. */
export function findUnsupportedFigures(
  output: string,
  sources: Array<string | null | undefined>,
  kinds: FigureKind[] = ALL_KINDS,
): string[] {
  const texts = sources.filter((s): s is string => typeof s === 'string' && s.length > 0)
  return extractFigures(output, kinds).filter((figure) => {
    const num = numberOf(figure)
    return num !== null && !sourceHasNumber(texts, num)
  })
}

/** Money amounts anywhere in a string — for fields that must never carry one. */
export function containsMoney(text: string): boolean {
  MONEY.lastIndex = 0
  return MONEY.test(text)
}
