import { useMemo, useState } from 'react'
import type { Strings, Lang } from '../i18n'
import { inScript, digits } from '../i18n/script'
import { readingsOf, imamDirectory, type Reading } from '../catalog/byImam'
import { surahSeconds, PLACES } from '../catalog/mosques'
import type { SurahMeta } from '../catalog/types'
import type { Face } from '../db/faces'
import { formatTime } from './format'
import { Play } from './Icons'

type Props = {
  t: Strings
  lang: Lang
  surahMeta: SurahMeta[]
  /** Portraits the listener added, keyed by imam id, which win over bundled. */
  faces: Map<string, Face>
  onPlay: (reciterId: string, surah: number, at: number) => void
  /** Open a year's collection without playing anything, for the Ramadans
   *  whose surahs are not attributed and so have nothing to play *to*. */
  onOpenYear: (reciterId: string) => void
}

/**
 * The archive by the man reciting rather than by the year he recited in.
 *
 * Fifty-seven Taraweeh years are a historical record and a terrible way to
 * find a voice: someone who wants Sheikh Baleela has to know which years he
 * led before they can look. The attribution needed to answer it directly —
 * which imam, which surah, and where inside a surah he takes over — is
 * already in the app to label the player. Read backwards it turns a pile of
 * recordings into a library of reciters.
 *
 * A year stays collapsed until asked for. Sudais alone spans thirty years of
 * Ramadan, and rendering every surah of every one of them to show a list of
 * names would cost seconds on the phone this is mostly used on.
 */
export function ImamPanel({ t, lang, surahMeta, faces, onPlay, onOpenYear }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const [openYear, setOpenYear] = useState<number | null>(null)

  const imams = useMemo(
    () => imamDirectory((place, year, surah) => surahSeconds(place, year, surah)),
    [],
  )

  const chosen = imams.find((i) => i.id === open) ?? null

  const byYear = useMemo(() => {
    if (!chosen) return []
    const groups = new Map<number, Reading[]>()
    for (const r of readingsOf(chosen.id)) {
      if (!groups.has(r.year)) groups.set(r.year, [])
      groups.get(r.year)!.push(r)
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0])
  }, [chosen])

  const portrait = (id: string, photo?: string) => {
    const mine = faces.get(id)
    if (mine?.url) return mine.url
    return photo ? `${import.meta.env.BASE_URL}${photo}` : null
  }

  if (chosen) {
    const src = portrait(chosen.id, chosen.photo)
    return (
      <section className="imams">
        <button type="button" className="imam-back" onClick={() => setOpen(null)}>
          {t.imamsBack}
        </button>

        <header className="imam-head">
          <div
            className="medallion imam-face-lg"
            style={src ? { ['--face-src' as string]: `url('${src}')` } : undefined}
            aria-hidden="true"
          />
          <div>
            <h2>{inScript(lang, chosen.name, chosen.nameEn)}</h2>
            <Meta t={t} lang={lang} i={chosen} />
          </div>
        </header>

        {byYear.length > 0 && <h3 className="imam-section">{t.imamNamed}</h3>}

        {byYear.map(([year, readings]) => {
          const isOpen = openYear === year
          return (
            <div key={year} className="imam-year">
              <button
                type="button"
                className="imam-year-head"
                aria-expanded={isOpen}
                onClick={() => setOpenYear(isOpen ? null : year)}
              >
                <span>{placeOf(readings[0], lang)}</span>
                <span className="imam-year-n">{digits(lang, year)}</span>
                <span className="imam-year-c">
                  {t.imamSurahs(digits(lang, readings.length), readings.length === 1)}
                </span>
                <span className="imam-caret" aria-hidden="true">
                  {isOpen ? '−' : '+'}
                </span>
              </button>

              {isOpen && (
                <ul className="imam-readings">
                  {readings.map((r) => {
                    const meta = surahMeta[r.surah - 1]
                    return (
                      <li key={`${r.surah}:${r.from}`}>
                        <button
                          type="button"
                          className="imam-reading"
                          onClick={() => onPlay(r.reciterId, r.surah, r.from)}
                        >
                          <span className="imam-r-num">{digits(lang, r.surah)}</span>
                          <span className="imam-r-name">
                            <span className="imam-r-ar" lang="ar">
                              {meta?.name}
                            </span>
                            {lang !== 'ar' && meta && (
                              <span className="imam-r-en">{meta.nameEn}</span>
                            )}
                          </span>
                          {/* Only a shared surah carries a starting point;
                              saying "from 0:00" on the rest is noise. */}
                          {!r.whole && r.from > 0 && (
                            <span className="imam-r-at">
                              {t.imamFrom(formatTime(r.from, lang))}
                            </span>
                          )}
                          <Play size={16} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}

        {chosen.seasons.length > 0 && (
          <>
            <h3 className="imam-section">{t.imamLed}</h3>
            <ul className="imam-seasons">
              {chosen.seasons.map((se) => (
                <li key={se.reciterId}>
                  <button
                    type="button"
                    className="imam-season"
                    onClick={() => onOpenYear(se.reciterId)}
                  >
                    <span className="imam-s-place">
                      {inScript(
                        lang,
                        PLACES.find((p) => p.place === se.place)?.shortAr ?? '',
                        PLACES.find((p) => p.place === se.place)?.shortEn ?? '',
                      )}
                    </span>
                    <span className="imam-s-year">{digits(lang, se.year)}</span>
                    {se.ce && <span className="imam-s-ce">{digits(lang, se.ce)}</span>}
                    <span className="imam-s-go">{t.imamOpen}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    )
  }

  return (
    <section className="imams">
      <h2>{t.imams}</h2>
      <p className="imams-intro">{t.imamsIntro}</p>
      <ul className="imam-list">
        {imams.map((i) => {
          const src = portrait(i.id, i.photo)
          return (
            <li key={i.id}>
              <button type="button" className="imam-row" onClick={() => {
                setOpen(i.id)
                setOpenYear(i.years[0] ?? null)
              }}>
                <div
                  className="medallion imam-face"
                  style={src ? { ['--face-src' as string]: `url('${src}')` } : undefined}
                  aria-hidden="true"
                />
                <span className="imam-names">
                  <span className="imam-ar">{inScript(lang, i.name, i.nameEn)}</span>
                  <Meta t={t} lang={lang} i={i} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Which mosque a year belongs to, since an imam may have served both. */
function placeOf(r: Reading, lang: Lang): string {
  const m = PLACES.find((p) => p.place === r.place)
  return m ? inScript(lang, m.shortAr, m.shortEn) : ''
}

/**
 * The one-line count under a name, as isolated runs rather than one string.
 *
 * Joining these with a separator put a neutral "·" between an Arabic word and
 * the digits of the next part, and bidi reordering then glued it to the
 * number: "٢٩ سورة · ٢٩ سنة · ٢ ساعة" came out reading ٢٩٠ and ٢٠. Each part
 * is its own isolated element instead, so no part can be reordered into its
 * neighbour.
 */
function Meta({
  t,
  lang,
  i,
}: {
  t: Strings
  lang: Lang
  i: { surahs: number; years: number[]; seasons: unknown[]; seconds: number }
}) {
  return (
    <p className="imam-meta">
      {summary(t, lang, i).map((part, n) => (
        <span key={n} className="imam-bit">
          {part}
        </span>
      ))}
    </p>
  )
}

function summary(
  t: Strings,
  lang: Lang,
  i: { surahs: number; years: number[]; seasons: unknown[]; seconds: number },
): string[] {
  // Every Ramadan he led, however deeply that year is attributed. Reporting
  // only the named ones would say Sudais has two years behind him.
  const ramadans = i.years.length + i.seasons.length
  const parts = [t.imamYears(digits(lang, ramadans), ramadans === 1)]
  if (i.surahs) parts.unshift(t.imamSurahs(digits(lang, i.surahs), i.surahs === 1))
  // Hours only where the build could read durations; a rounded zero would
  // claim there is nothing to hear.
  const hours = Math.round(i.seconds / 3600)
  if (hours >= 1) parts.push(t.imamHours(digits(lang, hours), hours === 1))
  return parts
}
