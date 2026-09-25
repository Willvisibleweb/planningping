'use client'

// A location field that takes a postcode OR a place name, with suggestions.
//
// People think in towns, not postcodes. Typing "stoke on t" offers
// Stoke-on-Trent before the typo ever happens, and "Alton" lists each Alton
// with its district so the right one is picked rather than guessed. A postcode
// typed in is left alone — no suggestions, submitted as it always was.
//
// Picking a suggestion reports the place (with its coordinates) through
// onSelect; typing again clears it, so a stale choice is never submitted under
// different text. When used inside a plain <form action>, the choice also
// travels as hidden place_* fields.
//
// Follows the WAI-ARIA combobox pattern: arrow keys move, Enter picks, Escape
// closes, and the input stays focused throughout.

import { useEffect, useId, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { suggestPlacesAction } from '@/lib/search/actions'
import type { PlaceSuggestion } from '@/lib/places'
import { cn } from '@/lib/cn'

// Duplicated from lib/places/rankPlaces rather than imported, to keep the
// server-side module out of the client bundle. Must stay in step with it.
const POSTCODE_LIKE = /^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{0,2})?$/i

const DEBOUNCE_MS = 220

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onSelect'> {
  value: string
  onChange: (text: string) => void
  /** The picked place, or null once the text is edited away from it. */
  onSelect?: (place: PlaceSuggestion | null) => void
  /** Emit hidden place_lat / place_lng / place_name inputs for <form action>. */
  hiddenFields?: boolean
  /** Classes for the wrapper, which is relative-positioned for the list. */
  wrapperClassName?: string
}

export default function PlaceInput({
  value,
  onChange,
  onSelect,
  hiddenFields,
  wrapperClassName,
  className,
  onKeyDown,
  onBlur,
  ...inputProps
}: Props) {
  const listId = useId()
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<PlaceSuggestion | null>(null)

  // Only the newest request may update the list. Responses arrive out of
  // order, and "liv" landing after "liverpool" would replace good answers with
  // worse ones.
  const requestSeq = useRef(0)

  useEffect(() => {
    const q = value.trim()
    // Nothing to fetch — clearing the list is done where the text changes, so
    // this effect only ever schedules a request.
    if (picked || q.length < 2 || POSTCODE_LIKE.test(q)) return

    const seq = ++requestSeq.current
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const results = await suggestPlacesAction(q)
        if (seq !== requestSeq.current) return
        setSuggestions(results)
        setActive(results.length ? 0 : -1)
        setOpen(true)
      } catch {
        // A failed suggestion is not an error the person needs to see — the
        // field still submits whatever they typed.
      } finally {
        if (seq === requestSeq.current) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [value, picked])

  function handleChange(text: string) {
    onChange(text)
    if (picked) {
      setPicked(null)
      onSelect?.(null)
    }
    const q = text.trim()
    if (q.length < 2 || POSTCODE_LIKE.test(q)) {
      requestSeq.current++
      setSuggestions([])
      setOpen(false)
      setLoading(false)
    }
  }

  function choose(place: PlaceSuggestion) {
    requestSeq.current++
    setPicked(place)
    onChange(place.name)
    onSelect?.(place)
    setOpen(false)
    setSuggestions([])
  }

  // A pick only counts while the text still says what was picked — if the
  // parent resets the field, the old place must not ride along in the form.
  const current = picked && picked.name === value ? picked : null
  const showList = open && !current && value.trim().length >= 2

  return (
    <div className={cn('relative', wrapperClassName)}>
      <input
        {...inputProps}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={value}
        className={className}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (showList && suggestions.length) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => (i + 1) % suggestions.length)
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
              return
            }
            if (e.key === 'Enter' && active >= 0) {
              // Picks the highlighted place instead of submitting. A second
              // Enter, with the list closed, submits as normal.
              e.preventDefault()
              choose(suggestions[active])
              return
            }
          }
          if (e.key === 'Escape' && showList) {
            e.preventDefault()
            setOpen(false)
            return
          }
          onKeyDown?.(e)
        }}
        onBlur={(e) => {
          setOpen(false)
          onBlur?.(e)
        }}
        onFocus={() => {
          if (suggestions.length && !current) setOpen(true)
        }}
      />

      {hiddenFields && current && (
        <>
          <input type="hidden" name="place_lat" value={current.lat} />
          <input type="hidden" name="place_lng" value={current.lng} />
          <input type="hidden" name="place_name" value={current.name} />
        </>
      )}

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-sm border border-border bg-surface py-1 text-left shadow-lg"
        >
          {suggestions.length === 0 ? (
            <li className="px-3 py-2 text-xs text-ink-muted" role="presentation">
              {loading ? 'Searching…' : 'No places found. Try a postcode instead.'}
            </li>
          ) : (
            suggestions.map((s, i) => (
              <li
                key={s.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // mousedown, not click: click fires after the input's blur has
                // already closed the list.
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(s)
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex cursor-pointer items-start gap-2 px-3 py-2 text-sm text-ink',
                  i === active && 'bg-primary-50',
                )}
              >
                <MapPin size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-primary-500" />
                <span className="min-w-0">
                  <span className="font-medium">{s.name}</span>
                  {s.context && <span className="text-ink-muted">, {s.context}</span>}
                  <span className="ml-1.5 text-2xs uppercase tracking-wide text-neutral-500">{s.type}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
