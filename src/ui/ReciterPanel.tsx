import { useMemo, useState, type ReactNode } from 'react'
import type { Strings, Lang } from '../i18n'
import { digits } from '../i18n/script'
import { Chevron, Search } from './Icons'
import { foldArabic, foldLatin, skeleton } from '../catalog/search'
import { getReciters } from '../catalog/load'
import { fullTitle, shortTitle } from '../catalog/titles'
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
   * Called when the query changes, so the caller can put the reader back at
   * the top of the results.
   *
   * The scrolling element belongs to the app, not to this panel — filtering
   * from halfway down the roster otherwise leaves the view wherever the
   * browser clamped it as the list shrank, which is rarely where the matches
   * are.
   */
  onFilter?: () => void
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
 * Both spellings of every name and tag, by id.
 *
 * A face carries one label, in the reader's own script. So for a reader in
 * Arabic the only name on the card is ياسر الدوسري, and "dosari" — which is
 * what an English speaker with an Arabic interface types — would match
 * nothing at all. Same for the tag that tells Al-Juhany's two mushafs apart:
 * in Arabic the card says حفص and never "Hafs". The catalogue holds both
 * spellings of each and the id on the face is what joins them, so the search
 * reads them from there rather than from what happens to be printed.
 *
 * Resolved on first use rather than at import: this module is pulled in by
 * App, and the roster is only ever needed once somebody types.
 */
let spellings: Map<string, string[]> | null = null
function namesOf(id: string): string[] {
  if (!spellings) {
    spellings = new Map(
      getReciters().map((r) => [
        r.id,
        [r.name, r.nameEn, r.tag, r.tagEn].filter((s): s is string => !!s),
      ]),
    )
  }
  return spellings.get(id) ?? []
}

/**
 * Which languages' honorifics and offices to search.
 *
 * The reader's own, plus English and Arabic, because those are the two
 * scripts a query arrives in — a reader with the app in Urdu still types
 * "grand mosque" or "الحرم" when that is the phrase he knows the man by.
 */
const officeLangs = (lang: Lang): Lang[] =>
  lang === 'en' || lang === 'ar' ? ['en', 'ar'] : [lang, 'en', 'ar']

/**
 * One skeleton per word of a name, rather than one for the whole name.
 *
 * A skeleton comparison over the run-together name is too loose for a roster
 * this small: "Saud Ash-Shuraim" reduces to sdshshrm, which contains the sds
 * of Sudais, so searching for the imam of the Grand Mosque also returned the
 * man before him. Comparing word by word — saud, ash, shuraim — keeps the
 * forgiveness where it belongs, in how a single name is spelled.
 */
const wordSkeletons = (s: string) =>
  s
    .split(/[\s\-_]+/)
    .map(skeleton)
    .filter(Boolean)

/**
 * The faces whose name, honorific or office answers the query.
 *
 * Deliberately the same matcher the surah list uses. A plain substring test
 * cannot find "dosari" in "Al-Dosari" — the stored spelling carries the
 * article — nor "الدوسري" in "الدُّوسَري", which is written with the marks a
 * phone keyboard does not send. Those are the exact failures foldLatin and
 * foldArabic were written for, and a second, worse matcher here would
 * reintroduce every one of them.
 *
 * An empty query returns everyone, so clearing the box restores the grid.
 */
export function searchFaces(faces: HomeFace[], query: string, lang: Lang): HomeFace[] {
  const q = query.trim()
  if (!q) return faces

  const ar = foldArabic(q)
  const la = foldLatin(q)
  const sk = skeleton(q)

  return faces.filter((f) => {
    /* The label and the tag are what the cell prints, so they must be
       searchable whatever the catalogue says — a mushaf that arrived in a
       remote catalogue this build has never seen has no entry in `spellings`
       and would otherwise be unfindable. */
    const names = [f.label, f.tag, f.title, ...namesOf(f.id)].filter(
      (s): s is string => !!s,
    )
    const offices = officeLangs(lang).flatMap((l) => [
      shortTitle(f.id, l),
      fullTitle(f.id, l),
    ])
    const all = [...names, ...offices.filter((s): s is string => !!s)]

    for (const s of all) {
      if (ar && foldArabic(s).includes(ar)) return true
      if (la && foldLatin(s).includes(la)) return true
    }

    /* Names only, and only once the query is long enough to mean something:
       the consonant skeleton is what survives romanisation, so "Soudais"
       finds As-Sudais — but two consonants match half the roster, and a
       skeleton of an office would make every Grand Mosque imam a hit. */
    if (sk.length < 3) return false
    return names.some((s) => wordSkeletons(s).some((w) => w.includes(sk)))
  })
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
  onFilter,
  renderYears,
}: Props) {
  const [query, setQuery] = useState('')
  const shown = useMemo(() => searchFaces(faces, query, lang), [faces, query, lang])

  return (
    <div className="everyone">
      <h2 className="everyone-head">{t.reciters}</h2>

      {/* The same field as the Quran tab's, down to the class: one search
          box in the app, not two that look almost alike. */}
      <div className="search">
        <Search size={20} />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            onFilter?.()
          }}
          placeholder={t.searchReciters}
          aria-label={t.searchReciters}
        />
      </div>

      {/* Said out loud rather than left as a hole. An empty grid under a
          search box reads as the app having lost the roster. */}
      {query.trim() && shown.length === 0 ? (
        <p className="empty small">{t.noResults}</p>
      ) : (
      <ul className="face-grid">
        {shown.map((f) => {
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
      )}

      {/* Left standing while the grid narrows, on purpose. A mosque is not a
          reciter — its card opens thirty nights and a dozen imams — so hiding
          the archives behind a name search would take away the only other
          thing this screen offers. */}
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
