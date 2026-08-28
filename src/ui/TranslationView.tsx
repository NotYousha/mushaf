import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lang, Strings } from '../i18n'
import { digits, toArabicDigits } from '../i18n/script'
import {
  ayahsOfSurah,
  ayahStartsFor,
  loadLayout,
  loadTimings,
  pageForKey,
  type Layout,
} from '../mushaf/data'
import {
  hizbOfPage,
  juzOfPage,
  surahPage,
  type UnitWord,
} from '../mushaf/divisions'
import {
  TRANSLATIONS,
  loadTranslation,
  translationById,
  type TranslationText,
} from '../mushaf/translations'
import surahMeta from '../../data/surahs.json'

const NAMES = new Map(
  (surahMeta as { surah: number; name: string; nameEn: string }[]).map((m) => [
    m.surah,
    m,
  ]),
)

type Props = {
  surah: number | null
  lang: Lang
  t: Strings
  /** Playback position in seconds, for following the recitation. */
  time: number
  reciterId: string
  /** Which translation to set under each ayah. */
  translationId: string
  onChooseTranslation: (id: string) => void
  onSeek?: (seconds: number) => void
  unitWord?: UnitWord
}

/**
 * The Quran as ayahs with their meaning underneath.
 *
 * A different thing from the mushaf page, not a mode of it. The page is a
 * facsimile: fifteen lines, breaking where the print breaks, because that
 * geometry is what a hafiz has memorised. This is a document: one ayah, its
 * translation, the next — which cannot be laid out fifteen lines to a page
 * and should not try.
 *
 * The Arabic is read out of the same page layout the mushaf renders, so the
 * two can never disagree about a word.
 */
export function TranslationView({
  surah,
  lang,
  t,
  time,
  reciterId,
  translationId,
  onChooseTranslation,
  onSeek,
  unitWord = 'juz',
}: Props) {
  const [layout, setLayout] = useState<Layout | null>(null)
  const [text, setText] = useState<TranslationText | null>(null)
  const [starts, setStarts] = useState<number[] | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const scroller = useRef<HTMLDivElement | null>(null)

  /**
   * How many times the reader has asked for the layout.
   *
   * The layout is a 2.6 MB lazy chunk and is deliberately not precached, so
   * the first time this screen opens it needs a connection. When it does not
   * have one the import rejects, and the screen used to sit on "Loading…"
   * with nothing behind it — no error, no retry, and no way to ask again.
   * Bumping this re-runs the effect, and `loadLayout` no longer remembers the
   * failure, so a reader who has since found signal can simply tap.
   */
  const [attempt, setAttempt] = useState(0)
  const [layoutFailed, setLayoutFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setLayoutFailed(false)
    loadLayout().then(
      (l) => {
        if (alive) setLayout(l)
      },
      () => {
        if (alive) setLayoutFailed(true)
      },
    )
    return () => {
      alive = false
    }
  }, [attempt])

  useEffect(() => {
    let alive = true
    setText(null)
    void loadTranslation(translationId).then((x) => alive && setText(x))
    return () => {
      alive = false
    }
  }, [translationId])

  /*
   * Verse boundaries, for shading the ayah being recited.
   *
   * This asks for word timings and then throws away everything but the first
   * time of each ayah, because a verse start is the one thing both kinds of
   * timing agree on. Where no timings exist it is null, nothing is shaded,
   * and the view is a document rather than a follower — which is the honest
   * outcome and not a degraded one.
   */
  useEffect(() => {
    let alive = true
    setStarts(null)
    if (surah === null) return
    void loadTimings(reciterId).then(() => {
      if (alive) setStarts(ayahStartsFor(reciterId, surah))
    })
    return () => {
      alive = false
    }
  }, [reciterId, surah])

  const ayahs = useMemo(() => ayahsOfSurah(layout, surah), [layout, surah])

  /** The ayah being recited: the last one whose start has passed. */
  const active = useMemo(() => {
    if (!starts?.length) return null
    const ms = time * 1000
    let lo = 0
    let hi = starts.length - 1
    let found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (starts[mid] <= ms) {
        found = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    return found >= 0 ? found + 1 : null
  }, [starts, time])

  // Keep the ayah being recited on screen, unless the reader is scrolling
  // somewhere else — which is not distinguishable here, so this only moves
  // when the ayah changes rather than on every tick.
  useEffect(() => {
    if (active === null) return
    scroller.current
      ?.querySelector(`[data-ayah="${active}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active])

  /**
   * Where the reader is, as the header says it.
   *
   * The page of the ayah on screen, not of the surah — a reader forty ayahs
   * into An-Nisa is not on page 77, and the juz and hizb change under them
   * while the surah does not.
   */
  const [here, setHere] = useState<number>(() => (surah ? surahPage(surah) : 1))
  useEffect(() => {
    if (surah === null) return
    if (active === null) {
      setHere(surahPage(surah))
      return
    }
    void pageForKey(`${surah}:${active}:1`).then((p) => p && setHere(p))
  }, [surah, active])

  if (surah === null) return <p className="empty">{t.pickSurahForText}</p>
  if (!layout && layoutFailed) {
    return (
      <p className="empty">
        {t.textNeedsNet}
        <br />
        <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>
          {t.retry}
        </button>
      </p>
    )
  }
  if (!layout) return <p className="empty">{t.loading}</p>

  const meta = NAMES.get(surah)
  const chosen = translationById(translationId)
  const unitName = unitWord === 'para' ? t.paraN : t.juzN

  return (
    <div className="tview" ref={scroller}>
      {/*
          Where you are, in one line.

          Surah, page, juz, hizb and — while something is playing — the ayah.
          Sticky, because every one of those changes as you read and a reader
          who has to scroll back to the top to find out which juz they are in
          is being told nothing.
      */}
      <div className="tview-where">
        <span className="tview-surah">{meta?.nameEn}</span>
        <span className="tview-place">
          {t.pageN(digits(lang, here))}
          {' · '}
          {unitName(digits(lang, juzOfPage(here)))}
          {' · '}
          {t.hizbN(digits(lang, hizbOfPage(here)))}
          {active !== null && (
            <>
              {' · '}
              {digits(lang, surah)}:{digits(lang, active)}
            </>
          )}
        </span>
      </div>

      <div className="tview-pick">
        <button
          type="button"
          className="btn"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((o) => !o)}
        >
          {chosen ? chosen.name : t.translation}
        </button>
        {pickerOpen && (
          <ul className="tview-pick-list">
            {TRANSLATIONS.map((tr) => (
              <li key={tr.id}>
                <button
                  type="button"
                  className={tr.id === translationId ? 'on' : undefined}
                  onClick={() => {
                    onChooseTranslation(tr.id)
                    setPickerOpen(false)
                  }}
                >
                  <span className="tview-pick-name">{tr.name}</span>
                  {/* Al-Muyassar is a tafsir, and saying so to a reader of
                      Arabic matters — they are the ones who would notice. */}
                  <span className="tview-pick-by">
                    {tr.tafsir ? `${t.tafsirLabel} · ` : ''}
                    {tr.translator}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ol className="tview-list">
        {ayahs.map((a) => {
          const on = a.ayah === active
          return (
            <li
              key={a.ayah}
              data-ayah={a.ayah}
              className={`tayah${on ? ' is-now' : ''}`}
            >
              <div className="tayah-head">
                <span className="tayah-key">
                  {digits(lang, surah)}:{digits(lang, a.ayah)}
                </span>
                {/* Tapping the number plays from this ayah, where the
                    recitation is timed finely enough to find it. */}
                {onSeek && starts?.[a.ayah - 1] !== undefined && (
                  <button
                    type="button"
                    className="tayah-play"
                    aria-label={t.playFromHere}
                    onClick={() => onSeek(starts[a.ayah - 1] / 1000)}
                  >
                    ▸
                  </button>
                )}
              </div>

              {/*
                  The ayah closes with its rosette, as it does on the page.
                  `ayahsOfSurah` returns only the words — the layout keeps the
                  numeral as a separate keyless token and that token is
                  dropped when the ayah is reassembled — so without this the
                  verses ran into one another with nothing between them.

                  Always Arabic-Indic, whatever the interface language: this
                  is the number printed inside a mushaf's rosette, not a
                  figure in the reader's own numerals like the page count.
              */}
              <p className="tayah-ar" lang="ar" dir="rtl">
                {a.text}{' '}
                <span className="ayah-mark">{toArabicDigits(a.ayah)}</span>
              </p>

              {/*
                  The translation, or nothing.

                  Nothing while it is still arriving, and nothing if the fetch
                  failed — the ayah above is the Quran and is worth showing on
                  its own. A row of error text under every verse would be a
                  hundred and seventy-six copies of the same complaint.
              */}
              {text?.[String(surah)]?.[a.ayah - 1] && (
                <p
                  className="tayah-tr"
                  lang={chosen?.lang}
                  dir={
                    chosen?.lang === 'ar' || chosen?.lang === 'ur' ? 'rtl' : 'ltr'
                  }
                >
                  {text[String(surah)][a.ayah - 1]}
                </p>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
