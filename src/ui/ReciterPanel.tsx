import type { ReactNode } from 'react'
import type { Strings, Lang } from '../i18n'
import { digits } from '../i18n/script'
import { Chevron } from './Icons'
import type { HomeFace } from './HomePanel'

/** One mosque's Taraweeh archive, as much of it as the card needs to say. */
export type PlaceCard = {
  place: string
  /** The mosque, in the reader's script. */
  label: string
  /** How many Ramadans are published. */
  years: number
  /** Whether its year list is open. */
  open: boolean
  /** Whether the thing playing is one of its years, and which. */
  here: boolean
  year: number | null
  /** A few of the imams who led there, as a signature for the card. */
  faces: { id: string; label: string; src: string | null }[]
}

type Props = {
  t: Strings
  lang: Lang
  /** Every individual mushaf, portrait resolved and framed. */
  faces: HomeFace[]
  /** Which of them is selected, so the grid can say so. */
  activeId: string
  /** How many surahs each has, to mark the ones still being recorded. */
  counts: Record<string, number>
  places: PlaceCard[]
  onPick: (id: string) => void
  onTogglePlace: (place: string) => void
  /**
   * That mosque's year list, drawn immediately under its own card.
   *
   * Passed in rather than built here: the years, their imams and what
   * choosing one does all belong to the app, and this only decides where the
   * list appears. Under the card that opened it, so a second card between the
   * two never separates them.
   */
  renderYears?: (place: string) => ReactNode
}

/**
 * Everyone the app can play, in one place.
 *
 * This replaces a scrolling strip of chips that read "Yasser Al-Dosari
 * 114/114" — a row that spent most of its width on a number, put the mosque
 * archives on the same footing as one man's mushaf, and could only ever show
 * three names at once. A face is recognised faster than a name is read, and a
 * grid shows all of them without scrolling.
 *
 * The Taraweeh archives are below rather than beside: they are not a reciter.
 * A Ramadan at the Haram is thirty nights and a dozen imams, so each one opens
 * a year to choose from instead of selecting anything itself.
 */
export function ReciterPanel({
  t,
  lang,
  faces,
  activeId,
  counts,
  places,
  onPick,
  onTogglePlace,
  renderYears,
}: Props) {
  return (
    <div className="everyone">
      <h2 className="everyone-head">{t.reciters}</h2>

      <ul className="face-grid">
        {faces.map((f) => {
          const held = counts[f.id] ?? 0
          const on = f.id === activeId
          return (
            <li key={f.id}>
              <button
                type="button"
                className={`face-cell${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => onPick(f.id)}
              >
                <span
                  className={`face-round${f.src ? '' : ' is-empty'}`}
                  aria-hidden="true"
                  data-reciter={f.frame ? '' : f.id}
                  style={
                    f.src
                      ? {
                          backgroundImage: `url('${f.src}')`,
                          ...(f.frame
                            ? {
                                backgroundSize: `${f.frame.zoom}% auto`,
                                backgroundPosition: `${f.frame.x}% ${f.frame.y}%`,
                              }
                            : undefined),
                        }
                      : undefined
                  }
                />
                <span className="face-cell-name">
                  {f.title && <span className="face-cell-title">{f.title} </span>}
                  {f.label}
                </span>
                {/* Set only where a second card carries the same name and
                    face — see allFaces in App.tsx. */}
                {f.tag && <span className="face-cell-tag">{f.tag}</span>}
                {/*
                    Said only where it changes what you get.

                    The strip this replaces printed 114/114 against every
                    complete mushaf, which is a number that never varies and
                    told nobody anything. What a listener does need to know is
                    that As-Sudais's is twenty surahs so far, so that is the
                    only case that says anything at all.
                */}
                {held > 0 && held < 114 && (
                  <span className="face-cell-part">
                    {digits(lang, held)}/{digits(lang, 114)}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {places.length > 0 && (
        <>
          <h2 className="everyone-head">{t.taraweeh}</h2>
          <div className="places">
            {places.map((p) => (
              <div className="place-row" key={p.place}>
              <button
                type="button"
                className={`place${p.open ? ' is-open' : ''}${p.here ? ' is-on' : ''}`}
                aria-expanded={p.open}
                aria-controls={`years-${p.place}`}
                onClick={() => onTogglePlace(p.place)}
              >
                {/* The men who led there, as the card's own signature: two
                    mosques with the same name and count would otherwise be
                    told apart only by the word. */}
                {p.faces.length > 0 && (
                  <span className="place-faces" aria-hidden="true">
                    {p.faces.map((i) => (
                      <span
                        key={i.id}
                        className="place-face"
                        style={i.src ? { backgroundImage: `url('${i.src}')` } : undefined}
                      />
                    ))}
                  </span>
                )}
                <span className="place-text">
                  <span className="place-name">{p.label}</span>
                  <span className="place-meta">
                    {p.here && p.year !== null
                      ? digits(lang, p.year)
                      : t.haramCount(digits(lang, p.years))}
                  </span>
                </span>
                <span className="place-go" aria-hidden="true">
                  <Chevron size={18} />
                </span>
              </button>
              {renderYears?.(p.place)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
