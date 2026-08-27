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
import { MushafPage } from './MushafPage'
import { loadTajweed, type Tajweed } from '../mushaf/tajweed'
import surahMeta from '../../data/surahs.json'
import { getPref, setPref } from '../db/prefs'
import {
  ArrowBack,
  Bookmark,
  Expand,
  Library,
  More,
  Pause,
  Play,
} from './Icons'

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
  /**
   * Which page layout to draw, when it is not the bundled Madani one.
   *
   * An IndoPak mushaf is a different set of pages, not a restyling of these:
   * 610 of them, broken in different places. So the edition chooses the
   * layout file, and everything downstream keys off `surah:ayah:word`, which
   * is identical across all of them.
   */
  layoutName?: string
  /** A face this edition needs, applied to its words only. */
  fontFamily?: string
  /** Leave the reader. Drawn in the full-screen bar, where nothing else is. */
  onBack?: () => void
  /** Whether this page is one the reader has kept. */
  bookmarked?: boolean
  onBookmark?: (page: number) => void
  /**
   * What is playing, for the bar at the foot of a full-screen page.
   *
   * Absent means nothing is, and the bar is not drawn — an empty transport
   * over a page somebody is reading in silence is furniture.
   */
  nowPlaying?: {
    reciter: string
    playing: boolean
    onToggle: () => void
    onOpen: () => void
  } | null
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
 * The tightest a line's words may be set, as a fraction of the type size.
 *
 * A mushaf justifies every line to the same measure, so the gaps are never
 * identical — but they are close, and they are small. This is the floor the
 * fit measurement reserves, and the same number is the `gap` on the line in
 * CSS, so what is measured is what is drawn. It was 0.2em, which on a line of
 * nine words left the words visibly adrift once the type was sized by height;
 * the sizing is fixed above, and this is the belt to that pair of braces.
 */
const MIN_GAP_EM = 0.12

/**
 * How far a line's letters may be stretched to fill the measure.
 *
 * This is kashida by other means. A third is about where the widening starts
 * to read as a difference in weight between one line and its neighbour;
 * anything a line still needs past that goes into the word gaps instead.
 */
const MAX_STRETCH = 1.34

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

/** Re-exported: it moved to MushafPage, which is what prints it. */
export { showsBasmala } from './MushafPage'

const NAMES = new Map((surahMeta as { surah: number; name: string }[]).map((m) => [m.surah, m.name]))
/** The transliterated name, for the margin in a language that is not Arabic. */
const EN_NAMES = new Map(
  (surahMeta as { surah: number; nameEn: string }[]).map((m) => [m.surah, m.nameEn]),
)

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
  layoutName,
  fontFamily,
  onBack,
  bookmarked = false,
  onBookmark,
  nowPlaying,
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
  /** Where a drag on the strip began, to tell a tap from a page turn. */
  const swipe = useRef<{ x: number; y: number } | null>(null)
  /**
   * Suppresses the scroll handler while we are the ones scrolling.
   *
   * Turning to a page sets scrollLeft, which fires the same scroll event a
   * finger does — so without this a programmatic turn read its own motion
   * back as the reader turning the page, and cleared the `manual` flag that
   * had just been set.
   */
  const scrolling = useRef(0)
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
   * Put a leaf under the reader, without animating six hundred of them past.
   *
   * `scrollLeft` is negative in a right-to-left scroller — the spec settled
   * on 0 at the start and negative towards the end, and every browser
   * shipping today does that — so the offset is negated. Read back with
   * Math.abs, which is correct either way.
   */
  const scrollToPage = useCallback((index: number, smooth = false) => {
    const el = pageRef.current
    if (!el) return
    const w = el.clientWidth
    if (!w) return
    scrolling.current = performance.now()
    el.scrollTo({ left: -index * w, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  /** Which leaf the strip has come to rest on. */
  const onStripScroll = useCallback(() => {
    const el = pageRef.current
    if (!el || !el.clientWidth) return
    // Our own scrolling, not the reader's.
    if (performance.now() - scrolling.current < 400) return
    const at = Math.round(Math.abs(el.scrollLeft) / el.clientWidth)
    setPage((prev) => {
      if (at === prev) return prev
      setManual(true)
      return at
    })
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
    Promise.all([loadLayout(layoutName), loadTimings(reciterId)]).then(([l, ti]) => {
      if (!alive) return
      setLayout(l)
      setTimings(ti)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [reciterId, layoutName])

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

  /*
   * Keep the strip on the leaf that `page` names.
   *
   * turn() scrolls as well as setting, but the three effects above only set —
   * following the recitation across a page, opening a surah that does not
   * begin on page 1, and arriving from the index. Only slots within one of
   * `page` render any words, so the scroller stayed parked on a slot that had
   * just been emptied and the reader got a blank leaf.
   *
   * Guarded on being out of step rather than scrolling unconditionally: when
   * the reader swipes, onStripScroll sets `page` to where the strip already
   * is, and scrolling again would arm that handler's 400ms deaf period for no
   * reason and swallow a quick second swipe.
   */
  useEffect(() => {
    const el = pageRef.current
    if (!el || !el.clientWidth) return
    const at = Math.round(Math.abs(el.scrollLeft) / el.clientWidth)
    if (at !== page) scrollToPage(page)
  }, [page, scrollToPage])

  // Arriving from the hifz board. This counts as turning the page by hand, so
  // playback does not immediately drag the view back to where the audio is.
  useEffect(() => {
    if (!gotoPage || !layout) return
    setManual(true)
    // The layout's own length, not 604: scripts/build-alt-layouts.mjs builds a
    // 610-page IndoPak and a 548-page 16-line, and a fixed ceiling would clamp
    // the one and strand the last six pages of the other. Waiting for the
    // layout is not a delay either -- there is nothing to show a page of until
    // it arrives.
    setPage(Math.max(0, Math.min(layout.pages.length - 1, gotoPage - 1)))
    onWentToPage?.()
  }, [gotoPage, onWentToPage, layout])

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
   * Size the type to fill the measure, then shrink the block to fit the leaf.
   *
   * Two steps, and the order is the whole point. Sizing by height first — set
   * the type small enough that fifteen lines fit, then justify each line edge
   * to edge — is what flung the words apart: whatever width the line did not
   * need went into the gaps, and a mushaf's spacing is even and tight. So the
   * type is sized by *width*, from the line that needs the most room, which
   * is what makes the words sit as they do in print. Only then is the whole
   * block scaled down as one if fifteen lines are still too tall, and the
   * gaps shrink with the letters rather than instead of them.
   */
  const fitPage = useCallback(() => {
    /*
     * The leaf being read, named — not the first one in the DOM.
     *
     * The strip renders three leaves at a time, so `querySelector('.mpage')`
     * returns whichever of them comes first, which is the *previous* page
     * everywhere but the very start of the mushaf. The type was therefore
     * being sized to a page the reader was not looking at, and a page whose
     * longest line is shorter gives a size at which every line on the real
     * page has slack to spread into — which is most of why the words sat so
     * far apart.
     */
    const leaf = pageRef.current?.querySelector<HTMLElement>(
      `.mpage[data-page="${pageRef.current.dataset.at}"]`,
    )
    const body = leaf?.querySelector<HTMLElement>('.mpage-body')
    const block = leaf?.querySelector<HTMLElement>('.mpage-lines')
    if (!leaf || !body || !block) return

    const host = pageRef.current!
    // Measure at a known size, so the answer does not depend on whatever
    // scale the previous page happened to land on.
    host.style.setProperty('--fit', '1')
    host.style.setProperty('--zoom', '1')
    host.style.setProperty('--squeeze', '1')

    const cs = getComputedStyle(block)
    const base = parseFloat(cs.fontSize) || 16
    const avail = block.clientWidth - 1
    if (avail <= 0) return

    // The lines are justified, so a line that fits reports the container's
    // width rather than its own. The natural width has to be added up from
    // the words themselves, plus the tightest spacing they may be set at.
    let widest = 0
    for (const line of Array.from(block.querySelectorAll('.mushaf-line'))) {
      const words = Array.from(line.children)
      let w = 0
      for (const word of words) w += word.getBoundingClientRect().width
      w += Math.max(0, words.length - 1) * base * MIN_GAP_EM
      widest = Math.max(widest, w)
    }
    if (!widest) return

    // Never so small it cannot be read, never wider than the measure.
    const fit = Math.max(0.62, Math.min(2.4, (avail / widest) * 0.998))
    host.style.setProperty('--fit', String(fit))
    host.style.setProperty('--zoom', String(ZOOMS[zoomRef.current]))

    /*
     * Fill the measure by stretching the letters, not the gaps.
     *
     * Every line of a mushaf reaches both margins. Ours do too — they are
     * flex rows justified edge to edge — but the *type* is not the type the
     * line breaks were computed for: these breaks come from the King Fahd
     * Complex's page and we set them in Amiri Quran, which renders some
     * lines nearly a third narrower than the original face did. Justifying
     * that with `space-between` puts the whole difference into the word
     * gaps, eleven pixels of them, and the line stops looking like scripture
     * and starts looking like a ransom note.
     *
     * Print has exactly this problem and answers it with kashida: it
     * stretches the letters along the baseline until the line fills. We
     * cannot insert kashida — the text is Unicode and the elongation would go
     * into the scripture itself — but we can stretch the drawing of it, which
     * is the same idea one layer down.
     *
     * So each line is laid out in a box narrowed by exactly its stretch
     * factor, justified inside that box at the minimum gap, and then scaled
     * back out to the full measure. The arithmetic cancels: the gaps land at
     * the minimum and the letters take up the slack. Capped, because past
     * about a third the widening is visible as a difference in weight
     * between one line and the next; beyond the cap the remainder goes back
     * into the gaps, which is the lesser fault.
     */
    for (const line of Array.from(block.querySelectorAll<HTMLElement>('.mushaf-line'))) {
      line.style.width = ''
      line.style.transform = ''
      const words = Array.from(line.children)
      if (words.length < 2) continue
      let natural = 0
      for (const word of words) natural += word.getBoundingClientRect().width
      if (natural <= 0) continue
      const gaps = (words.length - 1) * base * fit * MIN_GAP_EM
      const want = (avail - gaps) / natural
      const k = Math.max(1, Math.min(MAX_STRETCH, want))
      if (k <= 1.001) continue
      // Width, not max-width, and anchored at the reading edge. Centring the
      // narrowed box and scaling about its middle put the line half its own
      // stretch off to one side; growing it from the right margin — where an
      // Arabic line begins — lands it exactly on both.
      line.style.width = `${avail / k}px`
      line.style.transform = `scaleX(${k})`
    }

    /*
     * Now the height. The leaf is a fixed box; the block inside it is
     * whatever fifteen lines come to. Scaling rather than resizing is what
     * keeps the spacing: a transform takes the gaps down in the same
     * proportion as the letters, where a smaller font size would have left
     * the gaps to be re-justified and spread out again.
     */
    body.style.removeProperty('height')
    const room = body.clientHeight
    const tall = block.scrollHeight
    host.style.setProperty(
      '--squeeze',
      String(room > 0 && tall > room ? Math.max(0.4, room / tall) : 1),
    )
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

  const lastPage = layout.pages.length - 1

  /** Turn the page by hand, which stops playback dragging the view back. */
  const turn = (delta: number) => {
    const next = Math.max(0, Math.min(lastPage, page + delta))
    if (next === page) return
    setManual(true)
    setPage(next)
    scrollToPage(next)
  }

  // The line Talqeen is on, marked so you can see where to pick up.
  const drillLine = activeLine?.page === page ? activeLine.line : null

  /*
   * Which leaves are actually drawn.
   *
   * The strip is six hundred and four slots wide so the snap points and the
   * scroll length are honest, but only the leaf in view and its two
   * neighbours carry any words. Fifteen justified lines is about a hundred
   * and fifty elements; six hundred pages of them is ninety thousand, and a
   * phone will not do that.
   */
  const near = (p: number) => Math.abs(p - page) <= 1
  const here = page + 1

  return (
    <div
      className={`mushaf${yourTurn ? ' your-turn' : ''}${
        immersive ? ' is-immersive' : ''
      }${immersive && chrome ? ' show-chrome' : ''}`}
      style={fontFamily ? ({ '--font-page': fontFamily } as React.CSSProperties) : undefined}
    >
      {/*
          The controls, over the page rather than beside it.

          Away by default — the page is the point — and a tap anywhere that is
          not a word brings them back. Two bars, because the two things a
          reader reaches for sit at opposite ends of the job: where am I and
          how do I leave, at the top; what is playing, at the foot.
      */}
      {immersive && (
        <div className="mchrome top glass" role="toolbar">
          {onBack && (
            <button type="button" className="mchrome-btn" onClick={onBack} aria-label={t.back}>
              <ArrowBack size={20} />
            </button>
          )}
          <div className="mchrome-title">
            <span className="mchrome-surah">
              {lang !== 'ar' && <span>{EN_NAMES.get(surahOfPage(here))}</span>}
              <span lang="ar">{NAMES.get(surahOfPage(here))}</span>
            </span>
            <span className="mchrome-place">
              {t.pageN(digits(lang, here))}
              {', '}
              {(unitWord === 'para' ? t.paraN : t.juzN)(digits(lang, juzOfPage(here)))}
            </span>
          </div>
          {onBookmark && (
            <button
              type="button"
              className={`mchrome-btn${bookmarked ? ' on' : ''}`}
              aria-pressed={bookmarked}
              onClick={() => onBookmark(here)}
              aria-label={t.bookmark}
            >
              <Bookmark size={20} filled={bookmarked} />
            </button>
          )}
          {onOpenIndex && (
            <button
              type="button"
              className="mchrome-btn"
              onClick={onOpenIndex}
              aria-label={t.mushafIndex}
            >
              <More size={20} />
            </button>
          )}
        </div>
      )}

      {/*
          The leaves, side by side.

          Right to left, one snap point each, because that is how a mushaf is
          turned. The strip scrolls; the leaf inside it never does — a page
          that scrolls is not a page.
      */}
      <div
        className="mpages"
        ref={pageRef}
        /* Which leaf the fit measurement should read. A data attribute rather
           than a ref, because the measurement runs from a callback that must
           not be re-created every time the page turns. */
        data-at={here}
        dir="rtl"
        onScroll={onStripScroll}
        onPointerDown={(e) => {
          swipe.current = { x: e.clientX, y: e.clientY }
          startPeek()
        }}
        onPointerUp={(e) => {
          endPeek()
          const from = swipe.current
          swipe.current = null
          if (!from || !immersive) return
          // A tap, not a drag, and not on a word — a word already means
          // "seek here". Anything else is a request for the controls.
          if (
            Math.abs(e.clientX - from.x) < 10 &&
            Math.abs(e.clientY - from.y) < 10 &&
            !(e.target as HTMLElement).closest('.mw')
          ) {
            setChrome((c) => !c)
          }
        }}
        onPointerCancel={() => {
          swipe.current = null
          endPeek()
        }}
        // Two fingers means "I stumbled here" — the whole input, deliberately.
        onTouchStart={(e) => {
          if (e.touches.length < 2) return
          cancelPeek()
          if (e.touches.length === 2 && activeKey) onStumble?.(activeKey, here)
        }}
      >
        {layout.pages.map((_, i) => (
          <div
            key={i}
            className={`mslot${veil === 'off' ? '' : ` veil-${veil}`}${
              peeking ? ' is-peeking' : ''
            }${zoomIdx > 0 ? ' is-zoomed' : ''}`}
            // Hidden from assistive technology in favour of the ayah-by-ayah
            // reading below: these words are laid out for the eye and the
            // finger, and none of them is a control.
            aria-hidden="true"
          >
            {near(i) && (
              <MushafPage
                layout={layout}
                page={i + 1}
                lang={lang}
                t={t}
                unitWord={unitWord}
                basmala={basmala}
                activeKey={activeKey}
                activeSurah={surah}
                activeAyah={activeAyah}
                rules={rules}
                drillLine={i === page ? drillLine : null}
                margins={immersive}
                onSeek={onSeek ? jumpTo : undefined}
              />
            )}
          </div>
        ))}
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

      {/* What is playing, at the foot, in full screen only. */}
      {immersive && nowPlaying && (
        <div className="mchrome bottom glass">
          <button
            type="button"
            className="mchrome-play"
            onClick={nowPlaying.onToggle}
            aria-label={nowPlaying.playing ? t.pause : t.play}
          >
            {nowPlaying.playing ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <span className="mchrome-reciter">{nowPlaying.reciter}</span>
          <button
            type="button"
            className="mchrome-btn"
            onClick={nowPlaying.onOpen}
            aria-label={t.tabQuran}
          >
            <More size={20} />
          </button>
        </div>
      )}

      {!immersive && (
        <div className="mushaf-bar">
          <button className="btn" onClick={() => turn(1)} disabled={page >= lastPage}>
            &lsaquo;
          </button>
          <span className="mushaf-num">{arabicNumber(here)}</span>
          <button className="btn" onClick={() => turn(-1)} disabled={page <= 0}>
            &rsaquo;
          </button>

          {onOpenIndex && (
            <button className="btn" aria-label={t.mushafIndex} onClick={onOpenIndex}>
              <Library size={18} />
            </button>
          )}

          {onImmersive && (
            <button
              className="btn full-btn"
              aria-label={t.fullScreen}
              onClick={() => {
                setChrome(false)
                onImmersive(true)
              }}
            >
              <Expand size={18} />
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
      )}

      {/* What the page can and cannot follow, said plainly — three answers,
          not two. Never in full screen, where the page is alone. */}
      {!immersive && granularity === 'ayah' && (
        <p className="mushaf-note">{t.ayahTimingsOnly}</p>
      )}
      {!immersive && granularity === null && <p className="mushaf-note">{t.noTimings}</p>}
    </div>
  )
}
