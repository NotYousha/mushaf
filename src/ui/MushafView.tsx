import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Strings } from '../i18n'
import {
  loadLayout,
  loadTimings,
  wordSchedule,
  type Layout,
  type Timings,
} from '../mushaf/data'
import surahMeta from '../../data/surahs.json'
import { getPref, setPref } from '../db/prefs'

type Props = {
  surah: number | null
  /** Playback position in seconds. */
  time: number
  reciterId: string
  t: Strings
  onSeek?: (seconds: number) => void
  /** The line Talqeen is working on, so the page can show it. */
  activeLine?: { page: number; line: number } | null
  /** True while the reciter is silent and it is your turn to recite. */
  yourTurn?: boolean
}

/**
 * Text sizes, as multiples of the size at which a page fits exactly.
 *
 * 1 is the printed page: fifteen lines, each filling its measure. Above it
 * the lines have to wrap, so the page stops being fifteen lines — which is
 * the trade, and worth it on a small screen.
 */
const ZOOMS = [1, 1.2, 1.45, 1.75, 2.1]

const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
const arabicNumber = (n: number) =>
  String(n)
    .split('')
    .map((d) => AR_DIGITS[Number(d)] ?? d)
    .join('')

const NAMES = new Map((surahMeta as { surah: number; name: string }[]).map((m) => [m.surah, m.name]))

export { ayahStartsFor } from '../mushaf/data'

export function MushafView({
  surah,
  time,
  reciterId,
  t,
  onSeek,
  activeLine,
  yourTurn,
}: Props) {
  const [layout, setLayout] = useState<Layout | null>(null)
  const [timings, setTimings] = useState<Timings | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [manual, setManual] = useState(false)
  const activeRef = useRef<HTMLSpanElement | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const [zoomIdx, setZoomIdx] = useState(0)
  const zoomRef = useRef(0)
  zoomRef.current = zoomIdx

  useEffect(() => {
    void getPref<number>('mushafZoom', 0).then((z) => setZoomIdx(Math.min(ZOOMS.length - 1, Math.max(0, z))))
  }, [])

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

  /** Every word of this surah in order, with the time it begins. */
  const schedule = useMemo(() => wordSchedule(timings, surah), [timings, surah])

  /** First page on which this surah appears. */
  const surahFirstPage = useMemo(() => {
    if (!layout || !surah) return 0
    const prefix = `${surah}:`
    for (let p = 0; p < layout.pages.length; p++) {
      for (const line of layout.pages[p]) {
        for (const w of line.w) {
          if (w[1]?.startsWith(prefix)) return p
        }
      }
    }
    return 0
  }, [layout, surah])

  /** Which page holds a given word. */
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

  // Follow the recitation across pages, unless the reader has turned a page
  // themselves — then stay put until playback catches up to that page.
  useEffect(() => {
    if (!activeKey) return
    const p = pageOfKey.get(activeKey)
    if (p === undefined) return
    if (manual && p !== page) return
    if (p !== page) setPage(p)
    if (manual && p === page) setManual(false)
  }, [activeKey, pageOfKey, manual, page])

  useEffect(() => {
    if (!manual && surahFirstPage && !activeKey) setPage(surahFirstPage)
  }, [surahFirstPage, manual, activeKey])

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
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
    // Clamped: never so small it cannot be read, never larger than a page of
    // print would be on this width.
    const fit = Math.max(0.62, Math.min(1.9, (avail / widest) * 0.995))
    el.style.setProperty('--fit', String(fit))
    el.style.setProperty('--zoom', String(ZOOMS[zoomRef.current]))
  }, [])

  useLayoutEffect(() => {
    fitPage()
  }, [fitPage, page, layout, zoomIdx])

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

  if (loading) return <p className="empty">{t.loading}</p>
  if (!layout) return <p className="empty">{t.noResults}</p>

  const lines = layout.pages[page] ?? []

  const jumpTo = (key: string) => {
    if (!onSeek) return
    const hit = schedule.find((s) => s.key === key)
    if (hit) onSeek(hit.at / 1000)
  }

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
    <div className={`mushaf${yourTurn ? ' your-turn' : ''}`}>
      <div
        className={`mushaf-page${zoomIdx > 0 ? ' is-zoomed' : ''}`}
        ref={pageRef}
      >
        {lines.map((line) => {
          const opens = opensWith(line)
          return (
        <div className="mushaf-row" key={line.n}>
          {opens !== null && (
            <span className="surah-band">
              <span className="surah-band-name">سُورَةُ {NAMES.get(opens)}</span>
            </span>
          )}
          <p
            className={`mushaf-line${line.n === drillLine ? ' is-drill' : ''}${
              line.w.length <= 3 ? ' is-short' : ''
            }`}
          >
            {line.w.map((w, i) => {
              const key = w[1]
              const isEnd = !key
              const active = key !== undefined && key === activeKey
              return (
                <span
                  key={`${line.n}-${i}`}
                  ref={active ? activeRef : undefined}
                  className={
                    isEnd ? 'ayah-mark' : `mw${active ? ' is-now' : ''}${onSeek ? ' tap' : ''}`
                  }
                  aria-hidden={isEnd ? 'true' : undefined}
                  onClick={key && onSeek ? () => jumpTo(key) : undefined}
                >
                  {w[0]}
                </span>
              )
            })}
          </p>
        </div>
          )
        })}
      </div>

      <div className="mushaf-bar">
        <button
          className="btn"
          onClick={() => {
            setManual(true)
            setPage(Math.min(layout.pages.length - 1, page + 1))
          }}
          disabled={page >= layout.pages.length - 1}
        >
          ‹
        </button>
        <span className="mushaf-num">{arabicNumber(page + 1)}</span>
        <button
          className="btn"
          onClick={() => {
            setManual(true)
            setPage(Math.max(0, page - 1))
          }}
          disabled={page <= 0}
        >
          ›
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

      {!timings && (
        <p className="mushaf-note">{t.noTimings}</p>
      )}
    </div>
  )
}
