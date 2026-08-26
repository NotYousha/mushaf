import { useEffect, useMemo, useRef, useState } from 'react'
import type { Strings } from '../i18n'

export type Command = {
  id: string
  /** Already localised by the caller: this component holds no strings of its own. */
  label: string
  hint?: string
  run: () => void
}

type Props = {
  t: Strings
  open: boolean
  commands: Command[]
  onClose: () => void
}

/** How many rows are worth showing before the list stops being scannable. */
const SHOWN = 12

/**
 * ⌘K.
 *
 * Filtering is a plain case-insensitive substring test over the labels the
 * caller supplies, which are already localised. Deliberately not a second fuzzy
 * matcher: searchSurahs() exists for surah names and is the authority on which
 * of two surahs matches "nur", and a rival implementation here would disagree
 * with the search field on the same query.
 */
export function CommandPalette({ t, open, commands, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const input = useRef<HTMLInputElement | null>(null)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands.slice(0, SHOWN)
    return commands.filter((c) => c.label.toLowerCase().includes(q)).slice(0, SHOWN)
  }, [commands, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    input.current?.focus()
  }, [open])

  if (!open) return null

  const choose = (i: number) => {
    const c = shown[i]
    if (!c) return
    c.run()
    onClose()
  }

  return (
    <div className="palette-scrim" onClick={onClose} role="presentation">
      <div
        className="palette glass"
        role="dialog"
        aria-modal="true"
        aria-label={t.search}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={input}
          className="palette-input"
          value={query}
          placeholder={t.search}
          aria-label={t.search}
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') return onClose()
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndex((i) => Math.min(i + 1, shown.length - 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex((i) => Math.max(i - 1, 0))
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              choose(index)
            }
          }}
        />
        <ul className="palette-list" role="listbox">
          {shown.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                className="palette-item"
                /* Pointer moves set the selection so the keyboard and the mouse
                   cannot disagree about which row Enter would run. */
                onMouseMove={() => setIndex(i)}
                onClick={() => choose(i)}
              >
                <span className="palette-label">{c.label}</span>
                {c.hint && <span className="palette-hint">{c.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
