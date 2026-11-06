import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { scrollParentY, useFollower } from './followScroll'
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

/** Text size steps for the Arabic and the translation, separately. */
const SCALES = [0.85, 1, 1.15, 1.3, 1.5, 1.75]
const SIZE_KEY = 'mushaf:tview-size'
/**
 * Read synchronously, from localStorage, so the chosen size is there on the
 * first paint rather than arriving a moment later from IndexedDB.
 */
function readSizes(): { ar: number; tr: number } {
  try {
    const v = JSON.parse(localStorage.getItem(SIZE_KEY) ?? 'null')
    if (v && Number.isInteger(v.ar) && Number.isInteger(v.tr)) {
      const clamp = (n: number) => Math.max(0, Math.min(SCALES.length - 1, n))
      return { ar: clamp(v.ar), tr: clamp(v.tr) }
    }
  } catch {
    /* blocked or unparseable: defaults */
  }
  return { ar: 1, tr: 1 }
}

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
  // Hooks first: the early returns below would otherwise change how many
  // run between renders (React error 310, which crashed this view).
  const [sizes, setSizes] = useState(readSizes)
  const [sizeOpen, setSizeOpen] = useState(false)
  const step = (which: 'ar' | 'tr', by: number) =>
    setSizes((cur) => {
      const next = { ...cur, [which]: Math.max(0, Math.min(SCALES.length - 1, cur[which] + by)) }
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify(next))
      } catch {
        /* site data blocked: the size still applies for this visit */
      }
      return next
    })

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

  /*
   * Keep the ayah being recited on screen, and stop the moment the reader
   * scrolls somewhere else.
   *
   * This used to say that a reader's scroll "is not distinguishable here", and
   * only moved on an ayah change to blunt the damage. It is distinguishable:
   * the follower remembers the scrollTop it wrote and treats anything else as
   * the reader taking over. Changing surah hands control back.
   */
  const follower = useFollower(
    () => scrollParentY(scroller.current) ?? scroller.current,
    surah,
  )
  useEffect(() => {
    if (active === null) return
    follower.follow(scroller.current?.querySelector(`[data-ayah="${active}"]`))
  }, [active, follower])

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
    <div
      className="tview"
      ref={scroller}
      // On this view, not on :root: a custom property written on the root
      // restyles the whole document, and only these rows use it.
      style={{ '--ayah-scale': SCALES[sizes.ar], '--tr-scale': SCALES[sizes.tr] } as CSSProperties}
    >
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
          className="btn tview-size-btn"
          aria-expanded={sizeOpen}
          aria-label={t.textSize}
          onClick={() => setSizeOpen((o) => !o)}
        >
          <span aria-hidden="true">Aa</span>
        </button>
        {sizeOpen && (
          <div className="tview-size" role="group" aria-label={t.textSize}>
            {(['ar', 'tr'] as const).map((which) => (
              <div className="tview-size-row" key={which}>
                <span>{which === 'ar' ? t.arabicText : t.translation}</span>
                <button
                  type="button"
                  className="btn"
                  aria-label={`${which === 'ar' ? t.arabicText : t.translation}: ${t.smaller}`}
                  disabled={sizes[which] === 0}
                  onClick={() => step(which, -1)}
                >
                  A−
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-label={`${which === 'ar' ? t.arabicText : t.translation}: ${t.larger}`}
                  disabled={sizes[which] === SCALES.length - 1}
                  onClick={() => step(which, 1)}
                >
                  A+
                </button>
              </div>
            ))}
          </div>
        )}
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
        {ayahs.map((a) => (
          <AyahRow
            key={a.ayah}
            surah={surah}
            ayah={a.ayah}
            arabic={a.text}
            on={a.ayah === active}
            lang={lang}
            playLabel={t.playFromHere}
            startMs={onSeek ? starts?.[a.ayah - 1] : undefined}
            onSeek={onSeek}
            translation={text?.[String(surah)]?.[a.ayah - 1]}
            trLang={chosen?.lang}
          />
        ))}
      </ol>
    </div>
  )
}

/**
 * One ayah, redrawn only when something about THIS ayah changes.
 *
 * The view re-renders on every playback tick (about four a second) because
 * `time` moves, and before this every row of the surah was rebuilt each
 * time: 286 rows of Arabic and translation for al-Baqarah. Every prop here
 * is a primitive or a stable callback, so memo skips all but the row whose
 * `on` flips when the recitation moves to the next ayah.
 */
const AyahRow = memo(function AyahRow({
  surah,
  ayah,
  arabic,
  on,
  lang,
  playLabel,
  startMs,
  onSeek,
  translation,
  trLang,
}: {
  surah: number
  ayah: number
  arabic: string
  on: boolean
  lang: Lang
  playLabel: string
  startMs: number | undefined
  onSeek?: (sec: number) => void
  translation: string | undefined
  trLang: string | undefined
}) {
  return (
    <li data-ayah={ayah} className={`tayah${on ? ' is-now' : ''}`}>
      <div className="tayah-head">
        <span className="tayah-key">
          {digits(lang, surah)}:{digits(lang, ayah)}
        </span>
        {/* Tapping the number plays from this ayah, where the
            recitation is timed finely enough to find it. */}
        {onSeek && startMs !== undefined && (
          <button
            type="button"
            className="tayah-play"
            aria-label={playLabel}
            onClick={() => onSeek(startMs / 1000)}
          >
            ▸
          </button>
        )}
      </div>

      {/*
          The ayah closes with its rosette, as it does on the page.
          `ayahsOfSurah` returns only the words, so without this the verses
          ran into one another with nothing between them. Always
          Arabic-Indic: this is the number printed inside a mushaf's rosette.
      */}
      <p className="tayah-ar" lang="ar" dir="rtl">
        {arabic} <span className="ayah-mark">{toArabicDigits(ayah)}</span>
      </p>

      {/*
          The translation, or nothing: nothing while it is still arriving,
          and nothing if the fetch failed. The ayah above is the Quran and is
          worth showing on its own.
      */}
      {translation && (
        <p className="tayah-tr" lang={trLang} dir={trLang === 'ar' || trLang === 'ur' ? 'rtl' : 'ltr'}>
          {translation}
        </p>
      )}
    </li>
  )
})
