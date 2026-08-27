import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Lang, Strings } from '../i18n'
import { digits } from '../i18n/script'
import {
  loadLayout,
  loadTimings,
  timingGranularity,
  wordSchedule,
  type Granularity,
  type Layout,
  type Timings,
} from '../mushaf/data'
import { juzOfPage, surahOfPage, type UnitWord } from '../mushaf/divisions'
import { loadTajweed, runs, type Span, type Tajweed } from '../mushaf/tajweed'
import surahMeta from '../../data/surahs.json'
import { getPref, setPref } from '../db/prefs'
import { Collapse, Expand, Library } from './Icons'

type Props = {
  surah: number | null
  lang: Lang
  /** Playback position in seconds. */
  time: number
  reciterId: string
  t: Strings
  onSeek?: (seconds: number) => void
  /** The line Talqeen is working on, so the page can show it. */
  activeLine?: { page: number; line: number } | null
  /** True while the reciter is silent and it is your turn to recite. */
  yourTurn?: boolean
  /** Called when the page is uncovered under the veil, and for how long. */
  onPeek?: (page: number, ms: number) => void
  /** Called when the listener marks a stumble on the word being recited. */
  onStumble?: (key: string, page: number) => void
  /** A page to turn to, 1-based, sent from the hifz board. */
  gotoPage?: number | null
  onWentToPage?: () => void
  /**
   * The reading this reciter follows, when it is not Hafs. The bundled text
   * and page layout are Hafs, so a different riwayah means the page on screen
   * is not the wording being recited.
   */
  riwayah?: string | null
  /**
   * The page has the whole screen: no app header, no dock, no card.
   *
   * Owned by the app rather than by this component, because what it turns off
   * is the app's own chrome. This is told what state it is in so it can size
   * the type to the room it actually has and print its own margins.
   */
  immersive?: boolean
  onImmersive?: (on: boolean) => void
  /** Open the index — the way to a surah, a juz or a hizb by name. */
  onOpenIndex?: () => void
  /** The page now showing, so the index can mark where the reader is. */
  onPageChange?: (page: number) => void
  /**
   * Juz, or Para. Both name the same thirtieth; an IndoPak reader knows it
   * only by the second name.
   */
  unitWord?: UnitWord
  /** Colour the letters by tajweed rule — the Tajweed mushaf. */
  tajweed?: boolean
}

/**
 * Text sizes, as multiples of the size at which a page fits exactly.
 *
 * 1 is the printed page: fifteen lines, each filling its measure. Above it
 * the lines have to wrap, so the page stops being fifteen lines — which is
 * the trade, and worth it on a small screen.
 */
const ZOOMS = [1, 1.2, 1.45, 1.75, 2.1]

/**
 * The veil: the page is taken away a layer at a time.
 *
 * Every level keeps the page's geometry exactly — the words still occupy
 * their positions, they are only made invisible. Where a phrase sits on the
 * page is part of what a hafiz has memorised, so collapsing the layout would
 * remove the very cue the drill is meant to test.
 */
const VEILS = ['off', 'faded', 'firsts', 'blank'] as const
export type Veil = (typeof VEILS)[number]

const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
const arabicNumber = (n: number) =>
  String(n)
    .split('')
    .map((d) => AR_DIGITS[Number(d)] ?? d)
    .join('')

/**
 * Whether a surah is printed with the basmala above it.
 *
 * Two exceptions, and they are exceptions for opposite reasons. At-Tawbah is
 * the one surah of the Quran that opens without it. Al-Fatiha opens with it
 * as ayah 1 — it is already in the text on the line below, and printing it
 * here would set it twice.
 */
export const showsBasmala = (surah: number) => surah !== 1 && surah !== 9

const NAMES = new Map((surahMeta as { surah: number; name: string }[]).map((m) => [m.surah, m.name]))
/** The transliterated name, for the margin in a language that is not Arabic. */
const EN_NAMES = new Map(
  (surahMeta as { surah: number; nameEn: string }[]).map((m) => [m.surah, m.nameEn]),
)

/**
 * One word of the page.
 *
 * Memoised because the highlight moves several times a second while audio
 * plays, and without this every word on the page — about a hundred and fifty
 * of them — was reconciled on each move to change the class on two.
 */
const MushafWord = memo(function MushafWord({
  text,
  wordKey,
  active,
  inAyah,
  lead,
  spans,
  onSeek,
}: {
  text: string
  wordKey: string | undefined
  active: boolean
  /** This word belongs to the ayah being recited, whether or not it is the
   *  word being recited. */
  inAyah: boolean
  lead: boolean
  /** Tajweed rules falling inside this word, on a tajweed mushaf. */
  spans?: Span[]
  onSeek?: (key: string) => void
}) {
  if (!wordKey) {
    return (
      <span className={`ayah-mark${inAyah ? ' in-ayah' : ''}`} aria-hidden="true">
        {text}
      </span>
    )
  }
  return (
    <span
      className={`mw${active ? ' is-now' : ''}${inAyah ? ' in-ayah' : ''}${
        onSeek ? ' tap' : ''
      }${lead ? ' is-lead' : ''}`}
      onClick={onSeek ? () => onSeek(wordKey) : undefined}
    >
      {/*
          Coloured inside, whole outside.

          The rules colour letters, not words, so the word is cut into runs —
          but it stays one element, which is what keeps the highlight, the
          tap target, the Veil and the fit measurement working unchanged. A
          word with no rules in it is rendered as bare text, with no wrapper
          at all: about a third of the Quran's words carry no colour and they
          should not each cost a span.
      */}
      {spans?.length
        ? runs(text, spans).map((r, i) =>
            r.rule ? (
              <span key={i} className={`tj tj-${r.rule}`}>
                {r.text}
              </span>
            ) : (
              r.text
            ),
          )
        : text}
    </span>
  )
})

export { ayahStartsFor } from '../mushaf/data'

export function MushafView({
  surah,
  lang,
  time,
  reciterId,
  t,
  onSeek,
  activeLine,
  yourTurn,
  onPeek,
  onStumble,
  gotoPage,
  onWentToPage,
  riwayah,
  immersive = false,
  onImmersive,
  onOpenIndex,
  onPageChange,
  unitWord = 'juz',
  tajweed = false,
}: Props) {
  const [layout, setLayout] = useState<Layout | null>(null)
  const [timings, setTimings] = useState<Timings | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [manual, setManual] = useState(false)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const [zoomIdx, setZoomIdx] = useState(0)
  const [veil, setVeil] = useState<Veil>('off')
  const [peeking, setPeeking] = useState(false)
  const peekStart = useRef(0)
  const zoomRef = useRef(0)
  zoomRef.current = zoomIdx
  /**
   * Whether the controls are showing over a full-screen page.
   *
   * Full screen starts with them away — that is the point of it — and a tap
   * on the page brings them back. Read from a ref inside the fit
   * measurement, which must not re-run when they appear: they float over the
   * page rather than taking room from it, so the type size does not change.
   */
  const [chrome, setChrome] = useState(false)
  const immersiveRef = useRef(false)
  immersiveRef.current = immersive
  /** Where a horizontal drag on the page began, for turning pages by swipe. */
  const swipe = useRef<{ x: number; y: number } | null>(null)
  /**
   * The tajweed rules, once fetched.
   *
   * Only for the tajweed mushaf, and only after it is chosen — 1.3 MB is not
   * a cost to put on a reader who never opens that edition. Until it arrives
   * the page renders uncoloured, which is the same page it was.
   */
  const [rules, setRules] = useState<Tajweed | null>(null)
  useEffect(() => {
    if (!tajweed) {
      setRules(null)
      return
    }
    let alive = true
    void loadTajweed().then((r) => alive && setRules(r))
    return () => {
      alive = false
    }
  }, [tajweed])

  useEffect(() => {
    void getPref<number>('mushafZoom', 0).then((z) => setZoomIdx(Math.min(ZOOMS.length - 1, Math.max(0, z))))
  }, [])

  /**
   * Press and hold to peek.
   *
   * The peek is reported rather than hidden, because how often you had to
   * look is the honest measure of whether the page is held — far better than
   * anything the app could infer on its own.
   */
  const startPeek = () => {
    if (veil === 'off') return
    peekStart.current = performance.now()
    setPeeking(true)
  }

  const endPeek = () => {
    if (!peeking) return
    setPeeking(false)
    onPeek?.(page + 1, Math.round(performance.now() - peekStart.current))
  }

  /** End a peek without counting it: the touch turned out to mean something
   *  else, and charging the reader for a peek they did not ask for would put
   *  noise into the one honest signal here. */
  const cancelPeek = () => setPeeking(false)

  const changeZoom = (delta: number) => {
    setZoomIdx((i) => {
      const next = Math.min(ZOOMS.length - 1, Math.max(0, i + delta))
      void setPref('mushafZoom', next)
      return next
    })
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([loadLayout(), loadTimings(reciterId)]).then(([l, ti]) => {
      if (!alive) return
      setLayout(l)
      setTimings(ti)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [reciterId])

  /** Every word of this surah in order, with the time it begins. Empty for a
   *  verse-timed recitation, which has no word positions to offer. */
  const schedule = useMemo(() => wordSchedule(timings, surah), [timings, surah])

  /**
   * How finely this recitation can be followed: word, ayah, or not at all.
   *
   * Recomputed when the loaded timings change rather than asked once, because
   * the answer before the file arrives is "not at all" and it must be allowed
   * to become something else.
   */
  const granularity: Granularity | null = useMemo(
    () => (timings ? timingGranularity(reciterId, surah) : null),
    [timings, reciterId, surah],
  )

  /** Where each ayah of this surah begins, in ms. Both kinds of timing carry
   *  this; it is the only thing they agree on. */
  const ayahStarts = useMemo(() => {
    const verses = surah !== null ? timings?.surahs[String(surah)] : undefined
    if (!verses) return null
    return verses.map(([ayah, starts]) => ({ ayah, at: starts[0] }))
  }, [timings, surah])

  /** First page on which this surah appears. */
  /**
   * Null for "not found", because zero is a real answer.
   *
   * Al-Fatiha is on page index 0, which was indistinguishable from the two
   * failure sentinels — and the consumer tested truthiness. So the page never
   * turned to Al-Fatiha: not on a repeat-all wrap from An-Nas, not on the
   * previous-surah button, not from the lock screen. Seven of the eight
   * reciters ship no word timings, so this effect is the only thing that moves
   * the page for them.
   */
  const surahFirstPage = useMemo(() => {
    if (!layout || !surah) return null
    const prefix = `${surah}:`
    for (let p = 0; p < layout.pages.length; p++) {
      for (const line of layout.pages[p]) {
        for (const w of line.w) {
          if (w[1]?.startsWith(prefix)) return p
        }
      }
    }
    return null
  }, [layout, surah])

  /** Which page holds a given word. */
  /**
   * The basmala as this mushaf prints it, taken from the mushaf itself.
   *
   * Every surah but At-Tawbah opens with it, on its own line above the first
   * ayah — and the layout does not carry that line. It holds only words that
   * belong to a numbered ayah, and above every surah except Al-Fatiha the
   * basmala belongs to none: it is printed, recited, and not counted. Page 2
   * of this data starts at line 3 for exactly that reason, with the heading
   * and the basmala both missing.
   *
   * It is read out of Al-Fatiha, where the same words *are* ayah 1, rather
   * than typed here. Quranic orthography is not something to retype from
   * memory into a source file, and taking it from the page guarantees the
   * same alifs, the same superscript alif in ٱلرَّحْمَـٰنِ, and the same font
   * behaviour as every other line.
   */
  const basmala = useMemo(() => {
    if (!layout) return null
    for (const page of layout.pages) {
      for (const line of page) {
        const words = line.w.filter((w) => w[1]?.startsWith('1:1:'))
        if (words.length >= 4) return words.map((w) => w[0]).join(' ')
      }
    }
    return null
  }, [layout])

  /**
   * The page's ayahs as whole ayahs, for a screen reader.
   *
   * On screen the page is fifteen paragraphs of separate words, because that
   * is what a mushaf page is and the word is what gets followed and tapped.
   * Read aloud it is fifteen paragraph breaks landing wherever the line
   * happens to end, which cuts most ayahs in half — an ayah is not a line and
   * on this page it almost never is one.
   *
   * So the visual page is hidden from assistive technology and this is
   * offered instead: each ayah once, whole, in order. No mainstream Quran app
   * claims screen-reader support, and the reason the substrate exists here is
   * that the text is Unicode rather than a glyph font — a glyph font cannot
   * be read aloud at all.
   */
  const spoken = useMemo(() => {
    if (!layout) return []
    const out: { key: string; text: string }[] = []
    for (const line of layout.pages[page] ?? []) {
      for (const w of line.w) {
        const k = w[1]
        if (!k) continue
        const [sn, ayah] = k.split(':')
        const id = `${sn}:${ayah}`
        const last = out[out.length - 1]
        if (last?.key === id) last.text += ' ' + w[0]
        else out.push({ key: id, text: w[0] })
      }
    }
    return out
  }, [layout, page])

  const pageOfKey = useMemo(() => {
    if (!layout) return new Map<string, number>()
    const m = new Map<string, number>()
    layout.pages.forEach((lines, p) => {
      for (const line of lines) for (const w of line.w) if (w[1]) m.set(w[1], p)
    })
    return m
  }, [layout])

  // The word being recited right now: the last one whose start has passed.
  const activeKey = useMemo(() => {
    if (!schedule.length) return null
    const ms = time * 1000
    let lo = 0
    let hi = schedule.length - 1
    let found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (schedule[mid].at <= ms) {
        found = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    return found >= 0 ? schedule[found].key : null
  }, [schedule, time])

  /**
   * The ayah being recited: the last one whose start has passed.
   *
   * Computed whatever the granularity, because the reference apps shade the
   * verse *and* box the word, and they are right to — the verse is the unit
   * of meaning, and a single boxed word in a page of a hundred and fifty
   * gives the eye nowhere to land. Where only verse timings exist this is the
   * whole of the following, and it is a real feature rather than a fallback.
   */
  const activeAyah = useMemo(() => {
    if (!ayahStarts?.length) return null
    const ms = time * 1000
    let lo = 0
    let hi = ayahStarts.length - 1
    let found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (ayahStarts[mid].at <= ms) {
        found = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    return found >= 0 ? ayahStarts[found].ayah : null
  }, [ayahStarts, time])

  /**
   * The word the page turns to follow.
   *
   * The word being recited where one is known, and the first word of the ayah
   * otherwise — so a verse-timed recitation turns the page at the right
   * moment even though it cannot say which word is being said on it.
   */
  const followKey =
    activeKey ?? (activeAyah !== null && surah !== null ? `${surah}:${activeAyah}:1` : null)

  // Follow the recitation across pages, unless the reader has turned a page
  // themselves — then stay put until playback catches up to that page.
  useEffect(() => {
    if (!followKey) return
    const p = pageOfKey.get(followKey)
    if (p === undefined) return
    if (manual && p !== page) return
    if (p !== page) setPage(p)
    if (manual && p === page) setManual(false)
  }, [followKey, pageOfKey, manual, page])

  useEffect(() => {
    if (!manual && surahFirstPage !== null && !followKey) setPage(surahFirstPage)
  }, [surahFirstPage, manual, followKey])

  // Arriving from the hifz board. This counts as turning the page by hand, so
  // playback does not immediately drag the view back to where the audio is.
  useEffect(() => {
    if (!gotoPage) return
    setManual(true)
    setPage(Math.max(0, Math.min(603, gotoPage - 1)))
    onWentToPage?.()
  }, [gotoPage, onWentToPage])

  // The page is owned here, but the index outside needs to know which one it
  // is to mark the reader's place, and the page is turned from four
  // directions — the buttons, a swipe, the hifz board, and the recitation
  // itself. One report from here covers all four.
  useEffect(() => {
    onPageChange?.(page + 1)
  }, [page, onPageChange])

  useEffect(() => {
    // Located rather than held by a ref: a ref on the active word would be a
    // changing prop, which is exactly what memoising the word avoids.
    pageRef.current
      ?.querySelector('.mw.is-now')
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeKey])

  /**
   * Size the page so its widest line just fits.
   *
   * A mushaf line is set to a fixed measure, and all fifteen share one type
   * size — so the page needs a single scale, taken from the line that needs
   * the most room. Without this the long lines run off the side of a phone,
   * which is most of why the page was unreadable.
   */
  const fitPage = useCallback(() => {
    const el = pageRef.current
    if (!el) return
    // clientWidth counts the page's own padding, which the text may not use.
    // Measuring against it lets every line run a few millimetres past the
    // frame — which is exactly what it looked like.
    const cs = getComputedStyle(el)
    const avail =
      el.clientWidth - parseFloat(cs.paddingInlineStart) - parseFloat(cs.paddingInlineEnd) - 1
    if (avail <= 0) return
    // Measure at a known size, then scale, so the result does not depend on
    // whatever scale the previous page happened to land on.
    el.style.setProperty('--fit', '1')
    el.style.setProperty('--zoom', '1')
    const base = parseFloat(cs.fontSize) || 16
    // The lines are justified, so a line that fits reports the container's
    // width rather than its own. The natural width has to be added up from
    // the words themselves, plus the tightest spacing they may be set at.
    let widest = 0
    for (const line of Array.from(el.querySelectorAll('.mushaf-line'))) {
      const words = Array.from(line.children)
      let w = 0
      for (const word of words) w += word.getBoundingClientRect().width
      w += Math.max(0, words.length - 1) * base * 0.2
      widest = Math.max(widest, w)
    }
    if (!widest) return
    /*
     * A page has to fit the screen in both directions. Width alone is the
     * obvious constraint and the only one that matters in portrait, but turn
     * the phone on its side and width becomes plentiful while height nearly
     * vanishes — measuring width only, the type scaled *up* and pushed
     * fifteen lines a long way past the bottom of the screen.
     */
    const lines = el.querySelectorAll('.mushaf-line').length || 15
    const viewport = window.innerHeight || 800
    /*
     * What is left after the dock and the page's own chrome.
     *
     * Full screen is most of why the page was too small to read. The app
     * header carrying the logo and wordmark, the dock, the card's padding
     * and the page's own frame together took a hundred and ninety pixels
     * off the height budget — on a phone that is nearly a quarter of the
     * screen, and fifteen lines were being sized into what was left. With
     * the chrome gone the page keeps everything but its two printed
     * margins, and the type grows to match.
     */
    const budget = Math.max(160, viewport - (immersiveRef.current ? 84 : 190))
    // Each line occupies its line-height, which is 2.5em of the page's size.
    const byHeight = budget / (lines * 2.5 * base)

    // Clamped: never so small it cannot be read, never larger than a page of
    // print would be on this width.
    const fit = Math.max(0.62, Math.min(1.9, byHeight, (avail / widest) * 0.995))
    el.style.setProperty('--fit', String(fit))
    el.style.setProperty('--zoom', String(ZOOMS[zoomRef.current]))
  }, [])

  useLayoutEffect(() => {
    fitPage()
  }, [fitPage, page, layout, zoomIdx, immersive])

  // A rotation changes the height budget, and on iOS does not always fire a
  // resize on the page element itself.
  useEffect(() => {
    const onResize = () => fitPage()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [fitPage])

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const el = pageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => fitPage())
    ro.observe(el)
    return () => ro.disconnect()
  }, [fitPage])

  // The first measurement happens in the fallback face, which is a different
  // width from Amiri Quran. Without measuring again once the real font has
  // arrived, the page keeps a scale computed for a font it is not using.
  useEffect(() => {
    void document.fonts?.ready.then(fitPage)
  }, [fitPage])

  // Showing Hafs words under a recitation of a different riwayah would be
  // worse than showing nothing: the reader would follow along and find the
  // page disagreeing with the voice, with no explanation.
  const jumpTo = useCallback(
    (key: string) => {
      if (!onSeek) return
      const hit = schedule.find((s) => s.key === key)
      if (hit) onSeek(hit.at / 1000)
    },
    [onSeek, schedule],
  )

  if (riwayah) return <p className="empty">{t.differentRiwayah(riwayah)}</p>
  if (loading) return <p className="empty">{t.loading}</p>
  if (!layout) return <p className="empty">{t.noResults}</p>

  const lines = layout.pages[page] ?? []
  const lastPage = layout.pages.length - 1

  /** Turn the page by hand, which stops playback dragging the view back. */
  const turn = (delta: number) => {
    const next = Math.max(0, Math.min(lastPage, page + delta))
    if (next === page) return
    setManual(true)
    setPage(next)
  }

  // The margins name the reader's place the way the printed page does: the
  // juz in one corner, the surah in the other, the page number at the foot.
  const printed = page + 1
  const marginSurah = surahOfPage(printed)
  const marginJuz = juzOfPage(printed)


  // The line Talqeen is on, marked so you can see where to pick up — and,
  // while it is your turn, veiled, because reading it back defeats the point.
  const drillLine = activeLine?.page === page ? activeLine.line : null

  /** The surah that begins on a given line, if one does. */
  const opensWith = (line: (typeof lines)[number]) => {
    for (const w of line.w) {
      const key = w[1]
      if (!key) continue
      const [sn, ayah, word] = key.split(':').map(Number)
      // A surah's very first word is where its heading belongs.
      if (ayah === 1 && word === 1) return sn
    }
    return null
  }

  return (
    <div
      className={`mushaf${yourTurn ? ' your-turn' : ''}${
        immersive ? ' is-immersive' : ''
      }${immersive && chrome ? ' show-chrome' : ''}`}
    >
      {/*
          The margins of the printed page.

          Only in full screen, and for the reason the printed mushaf has them:
          with the app's own header gone there is nothing else on the screen
          saying which juz this is or which surah. Inside the app they would
          be a second copy of what the header above already says.
      */}
      {immersive && (
        <div className="mushaf-margin top" aria-hidden="true">
          <span className="margin-juz">
            {(unitWord === 'para' ? t.paraN : t.juzN)(digits(lang, marginJuz))}
          </span>
          <span className="margin-surah">
            {lang !== 'ar' && (
              <span className="margin-surah-en">{EN_NAMES.get(marginSurah)}</span>
            )}
            <span className="margin-surah-ar" lang="ar">
              {NAMES.get(marginSurah)}
            </span>
          </span>
        </div>
      )}

      <div
        lang="ar"
        // Hidden from assistive technology in favour of the ayah-by-ayah
        // reading below: the words here are laid out for the eye and the
        // finger, and none of them is a control.
        aria-hidden="true"
        className={`mushaf-page${zoomIdx > 0 ? ' is-zoomed' : ''}${
          veil === 'off' ? '' : ` veil-${veil}`
        }${peeking ? ' is-peeking' : ''}`}
        ref={pageRef}
        onPointerDown={(e) => {
          swipe.current = { x: e.clientX, y: e.clientY }
          startPeek()
        }}
        onPointerUp={(e) => {
          endPeek()
          const from = swipe.current
          swipe.current = null
          if (!from) return
          const dx = e.clientX - from.x
          const dy = e.clientY - from.y
          /*
           * A swipe turns the page; a tap brings the controls back.
           *
           * Right-to-left, so dragging the page to the right pulls the next
           * one in, the way turning a leaf of a mushaf does. The threshold
           * is generous and the vertical guard is strict, because the page
           * scrolls under a finger too and a scroll must never turn it.
           */
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            turn(dx > 0 ? 1 : -1)
            return
          }
          // A tap on a word seeks; a tap on the page itself is for the
          // controls, and only in full screen where they are hidden.
          if (
            immersive &&
            Math.abs(dx) < 10 &&
            Math.abs(dy) < 10 &&
            !(e.target as HTMLElement).closest('.mw')
          ) {
            setChrome((c) => !c)
          }
        }}
        onPointerCancel={() => {
          swipe.current = null
          endPeek()
        }}
        onPointerLeave={() => {
          swipe.current = null
          endPeek()
        }}
        // Two fingers means "I stumbled here" — the whole input, deliberately.
        // Anything cleverer would need to listen to the reciter, which this
        // app will not do.
        onTouchStart={(e) => {
          if (e.touches.length < 2) return
          // The first finger already started a peek; two fingers means this
          // was a stumble mark all along.
          cancelPeek()
          if (e.touches.length === 2 && activeKey) onStumble?.(activeKey, page + 1)
        }}
      >
        {lines.map((line) => {
          const opens = opensWith(line)
          return (
        <div className="mushaf-row" key={line.n}>
          {opens !== null && (
            <span className="surah-band">
              <span className="surah-band-name" lang="ar">
                سُورَةُ {NAMES.get(opens)}
              </span>
            </span>
          )}
          {/*
              At-Tawbah is the one surah that opens without it, and Al-Fatiha
              is the one where it is ayah 1 and already on the line below —
              printing it here would set it twice.

              It carries no word keys, so word-following, the Veil and the
              fork drill all pass over it exactly as they pass over the
              heading. It is on the page because it is on the page.
          */}
          {opens !== null && showsBasmala(opens) && basmala && (
            <p className="mushaf-basmala" lang="ar">
              {basmala}
            </p>
          )}
          <p
            className={`mushaf-line${line.n === drillLine ? ' is-drill' : ''}${
              line.w.length <= 3 ? ' is-short' : ''
            }`}
          >
            {line.w.map((w, i) => {
              // The rosette belongs to the ayah it closes, and the layout
              // gives it no key — so it takes its shading from the word
              // before it, or the ayah's last word would sit inside the
              // highlight with its own number left outside.
              const key = w[1] ?? line.w[i - 1]?.[1]
              const ayah = key ? Number(key.split(':')[1]) : null
              return (
                <MushafWord
                  key={`${line.n}-${i}`}
                  text={w[0]}
                  wordKey={w[1]}
                  // A line can open with an ayah rosette, so "first word" is
                  // not the same as first child.
                  lead={i === line.w.findIndex((x) => x[1])}
                  active={w[1] !== undefined && w[1] === activeKey}
                  inAyah={
                    activeAyah !== null &&
                    ayah === activeAyah &&
                    key?.startsWith(`${surah}:`) === true
                  }
                  spans={w[1] ? rules?.[w[1]] : undefined}
                  onSeek={onSeek ? jumpTo : undefined}
                />
              )
            })}
          </p>
        </div>
          )
        })}
      </div>

      {/*
          Read aloud, not looked at.

          Withheld while the Veil is on: the Veil exists so a hafiz cannot see
          the words they are trying to recall, and a copy underneath that
          reads them out defeats it exactly.
      */}
      {veil === 'off' && (
        <div className="sr-only" lang="ar" dir="rtl">
          {spoken.map((a) => (
            <p key={a.key}>{a.text}</p>
          ))}
        </div>
      )}

      {/* The foot of the printed page: its number, and nothing else. */}
      {immersive && (
        <div className="mushaf-margin bottom" aria-hidden="true">
          <span className="margin-page">{digits(lang, printed)}</span>
        </div>
      )}

      <div className="mushaf-bar">
        <button className="btn" onClick={() => turn(1)} disabled={page >= lastPage}>
          ‹
        </button>
        <span className="mushaf-num">{arabicNumber(page + 1)}</span>
        <button className="btn" onClick={() => turn(-1)} disabled={page <= 0}>
          ›
        </button>

        {/*
            The index.

            Six hundred and four pages and two buttons that move one at a
            time. Everything else here adjusts how the page looks; this is
            the only control that answers "take me somewhere".
        */}
        {onOpenIndex && (
          <button className="btn" aria-label={t.mushafIndex} onClick={onOpenIndex}>
            <Library size={18} />
          </button>
        )}

        {/*
            Full screen.

            Placed on the page's own bar rather than in the app's header,
            because the header is the first thing it takes away — a control
            that removes itself is a control you cannot use again.
        */}
        {onImmersive && (
          <button
            className={`btn full-btn${immersive ? ' on' : ''}`}
            aria-pressed={immersive}
            aria-label={immersive ? t.exitFullScreen : t.fullScreen}
            onClick={() => {
              setChrome(false)
              onImmersive(!immersive)
            }}
          >
            {immersive ? <Collapse size={18} /> : <Expand size={18} />}
          </button>
        )}

        <button
          className={`btn veil-btn${veil === 'off' ? '' : ' on'}`}
          onClick={() => setVeil(VEILS[(VEILS.indexOf(veil) + 1) % VEILS.length])}
          aria-label={t.veil}
        >
          {t.veilName[veil]}
        </button>

        <span className="text-size">
          <button
            className="btn size"
            aria-label={t.textSmaller}
            onClick={() => changeZoom(-1)}
            disabled={zoomIdx <= 0}
          >
            ا
          </button>
          <button
            className="btn size big"
            aria-label={t.textLarger}
            onClick={() => changeZoom(1)}
            disabled={zoomIdx >= ZOOMS.length - 1}
          >
            ا
          </button>
        </span>
      </div>

      {zoomIdx > 0 && <p className="mushaf-note">{t.zoomedNote}</p>}

      {/*
          What the page can and cannot follow, said plainly.

          Coverage is per surah — a reciter can be timed for one and not the
          next — so this asks about the surah on screen. Three answers, not
          two: following the word, following the verse, or following nothing.
          Verse-following is a real thing the page is doing and saying so is
          not an apology; claiming word-following while shading a verse would
          be the actual failure.
      */}
      {granularity === 'ayah' && <p className="mushaf-note">{t.ayahTimingsOnly}</p>}
      {granularity === null && <p className="mushaf-note">{t.noTimings}</p>}
    </div>
  )
}
