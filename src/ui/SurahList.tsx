import { memo, useLayoutEffect, useRef } from 'react'
import type { SurahView } from '../catalog/types'
import { voiceLabel } from '../catalog/voice'
import { digits } from '../i18n/script'
import type { Strings, Lang } from '../i18n'
import { Download } from './Icons'

/** Bare surah name, diacritics removed. */
export const plainName = (s: string) => s.replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, '').trim()

/**
 * Tells CSS how tall a row is, by measuring one.
 *
 * motion.css lets the browser skip laying out rows that are off screen, which
 * costs it an estimate of their height. A wrong estimate is not cosmetic: the
 * list claims a scroll length it does not have and then shrinks as the real
 * rows are laid out, which reads as the list retreating while you scroll it.
 *
 * The height cannot be stated in CSS because it is not one number. A row grows
 * a gloss line in English and a reciter line on a multi-voice Taraweeh year,
 * so it ranges from 64px to 96px across the lists this component renders —
 * and the constant that used to be hardcoded was measured on the tallest of
 * them. Measuring the list's own first row is the only version of this that
 * cannot drift the next time the row is redesigned.
 */
function useRowHeight() {
  const ref = useRef<HTMLUListElement>(null)
  useLayoutEffect(() => {
    const list = ref.current
    const row = list?.firstElementChild
    if (!list || !(row instanceof HTMLElement)) return
    const measure = () => {
      const cs = getComputedStyle(row)
      // contain-intrinsic-size names the content box; the row is border-box.
      // Reserving the padding twice is how 4.6rem became 96px on screen.
      const h =
        row.getBoundingClientRect().height -
        parseFloat(cs.paddingTop) -
        parseFloat(cs.paddingBottom)
      if (h > 0) list.style.setProperty('--row-h', `${h}px`)
    }
    measure()
    // The Arabic face lands after first paint and the row grows when it does,
    // so a single measurement at mount would pin the fallback font's height.
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(row)
    return () => ro.disconnect()
    // Deliberately every render: changing language or reciter replaces the
    // first row, and a dependency list naming the props that do that is the
    // same thing as the constant this replaced — correct until it is not.
  })
  return ref
}

type Props = {
  surahs: SurahView[]
  reciterId: string
  lang: Lang
  t: Strings
  /** Marked by the listener as playing the wrong recitation. */
  rejected?: Set<number>
  downloaded: Set<number>
  /** Interrupted downloads: surah number to the fraction already stored. */
  partials?: Map<number, number>
  progress: Record<string, number>
  current: number | null
  /**
   * Whether sound is actually coming out.
   *
   * `current` only says which surah is loaded, which stays true across a
   * pause — so the equaliser went on bouncing over a stopped recitation and
   * told the reader the opposite of the truth.
   */
  playing?: boolean
  verified: (s: SurahView) => boolean
  onPlay: (surah: number) => void
  onDownload: (surah: number) => void
}

/**
 * Memoised, and its callers hand it stable callbacks.
 *
 * The player sets the playback position about four times a second. Without
 * this the whole list reconciled on every one of those ticks — 114 rows of
 * diffing, during the scroll that the ticks are most likely to coincide with.
 */
export const SurahList = memo(function SurahList({
  surahs,
  reciterId,
  lang,
  t,
  rejected,
  downloaded,
  partials,
  progress,
  current,
  playing = false,
  verified,
  onPlay,
  onDownload,
}: Props) {
  // Two lists, measured apart: an unreleased row ends in a word rather than a
  // save control, so the two are not the same height.
  const listedRef = useRowHeight()
  const upcomingRef = useRowHeight()

  // A surah saved from your own files is playable even if the catalog has not
  // published it, so it belongs in the main list rather than the pending one.
  const playable = (s: SurahView) =>
    (s.released || downloaded.has(s.surah)) && !rejected?.has(s.surah)
  const listed = surahs.filter(playable)
  const upcoming = surahs.filter((s) => !playable(s))
  // Specifically the last broadcast surah — an imported file is not one.
  const lastRecorded = [...listed].reverse().find((s) => s.released)

  if (!surahs.length) return <p className="empty">{t.noResults}</p>

  return (
    <>
      <ul className="surah-list" ref={listedRef}>
        {listed.map((s) => {
          const active = current === s.surah
          const have = downloaded.has(s.surah)
          const pct = progress[`${reciterId}:${s.surah}`]
          // Stored but unfinished: tapping continues from where it stopped
          // rather than starting the file over.
          const held = partials?.get(s.surah)
          return (
            <li key={s.surah} className={`row${active ? ' active' : ''}`}>
              {/* The row and the save control are siblings, never nested. A
                  button inside a button is invalid markup and swallows taps,
                  which is why saving a surah did nothing on a phone. */}
              <button
                type="button"
                className="row-main"
                onClick={() => onPlay(s.surah)}
                aria-current={active ? 'true' : undefined}
              >
                {/* The number, or the playing mark in its place. */}
                <span className="numeral">
                  {active ? (
                    <span className={`eq${playing ? '' : ' is-still'}`} aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    digits(lang, s.surah)
                  )}
                </span>
                <span className="names">
                  {/* Always Arabic, inside a document whose language is
                      the reader's. Unmarked, a screen reader gives it an
                      English voice and the surah name comes out as noise. */}
                  <span className="name-ar" lang="ar">
                    {t.surahWord} {s.name}
                  </span>
                  {lang === 'en' && (
                    <span className="name-plain">
                      {s.nameEn} · {s.translation}
                    </span>
                  )}
                  {/* Not gated on language the way the gloss above is. A
                      gloss is a convenience for one language; who is
                      reciting is information every reader wants, and
                      voiceLabel already picks the right script. */}
                  {voiceLabel(s, lang) && (
                    <span className="name-voice">{voiceLabel(s, lang)}</span>
                  )}
                </span>
              </button>

              {/*
                  Nothing is drawn here for a surah already saved.

                  It used to keep a disabled button carrying a tick, which is
                  an object per row saying there is nothing to do — and on a
                  list of 114, the rows with nothing to do should be the quiet
                  ones. The trailing drag handle went with it: this list has
                  never been reorderable, so it was an affordance for a
                  gesture that does not exist.
              */}
              <span className="row-end">
                {pct !== undefined ? (
                  <span className="ring">{digits(lang, Math.round(pct * 100))}%</span>
                ) : have ? null : (
                  <button
                    type="button"
                    className={`mini${held !== undefined ? ' is-partial' : ''}${!verified(s) ? ' needs-check' : ''}`}
                    aria-label={
                      held !== undefined ? t.resumeAt(Math.round(held * 100)) : t.save
                    }
                    onClick={() => onDownload(s.surah)}
                  >
                    <Download size={20} />
                    {held !== undefined && (
                      <span className="mini-pct">{digits(lang, Math.round(held * 100))}%</span>
                    )}
                  </button>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      {lastRecorded && upcoming.length > 0 && (
        <div className="frontier">
          <div className="fade" />
          <p>
            {lang === 'ar'
              ? `آخر سورة متاحة: ${plainName(lastRecorded.name)}`
              : `Last available: ${lastRecorded.nameEn}`}
          </p>
        </div>
      )}

      <ul className="surah-list" ref={upcomingRef}>
        {upcoming.map((s) => (
          <li key={s.surah} className="row is-off">
            <span className="row-main">
              <span className="numeral">{digits(lang, s.surah)}</span>
              <span className="names">
                <span className="name-ar">
                  {t.surahWord} {s.name}
                </span>
                {lang === 'en' && (
                  <span className="name-plain">
                    {s.nameEn} · {s.translation}
                  </span>
                )}
              </span>
            </span>
            <span className="row-end small">
              {rejected?.has(s.surah) ? t.excluded : t.notRecorded}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
})
