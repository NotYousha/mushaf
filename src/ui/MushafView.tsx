import { useEffect, useMemo, useRef, useState } from 'react'
import type { Strings } from '../i18n'

/** One word: its Uthmani text, and the key timings address it by. An ayah-end
 *  marker has no key. */
type Word = [string] | [string, string]
type Line = { n: number; w: Word[] }
type Layout = { version: string; pages: Line[][] }
/** Per surah: [ayah, [word start times in ms]] */
type Timings = { unit: string; source: string; surahs: Record<string, [number, number[]][]> }

type Props = {
  surah: number | null
  /** Playback position in seconds. */
  time: number
  reciterId: string
  t: Strings
  onSeek?: (seconds: number) => void
}

let layoutPromise: Promise<Layout> | null = null
const timingCache = new Map<string, Promise<Timings | null>>()

const loadLayout = () => {
  layoutPromise ??= import('../../data/mushaf-layout.json').then(
    (m) => m.default as unknown as Layout,
  )
  return layoutPromise
}

/** Only reciters with published word timings can be followed word by word. */
const loadTimings = (reciterId: string) => {
  if (!timingCache.has(reciterId)) {
    timingCache.set(
      reciterId,
      reciterId === 'burhaji-nabawi'
        ? import('../../data/timings-burhaji-nabawi.json').then(
            (m) => m.default as unknown as Timings,
          )
        : Promise.resolve(null),
    )
  }
  return timingCache.get(reciterId)!
}

export function MushafView({ surah, time, reciterId, t, onSeek }: Props) {
  const [layout, setLayout] = useState<Layout | null>(null)
  const [timings, setTimings] = useState<Timings | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [manual, setManual] = useState(false)
  const activeRef = useRef<HTMLSpanElement | null>(null)

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
  const schedule = useMemo(() => {
    if (!timings || !surah) return []
    const verses = timings.surahs[String(surah)]
    if (!verses) return []
    const out: { at: number; key: string }[] = []
    for (const [ayah, starts] of verses) {
      starts.forEach((at, i) => out.push({ at, key: `${surah}:${ayah}:${i + 1}` }))
    }
    return out.sort((a, b) => a.at - b.at)
  }, [timings, surah])

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

  if (loading) return <p className="empty">{t.loading}</p>
  if (!layout) return <p className="empty">{t.noResults}</p>

  const lines = layout.pages[page] ?? []

  const jumpTo = (key: string) => {
    if (!onSeek) return
    const hit = schedule.find((s) => s.key === key)
    if (hit) onSeek(hit.at / 1000)
  }

  return (
    <div className="mushaf">
      <div className="mushaf-page">
        {lines.map((line) => (
          <p className="mushaf-line" key={line.n}>
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
                  onClick={key && onSeek ? () => jumpTo(key) : undefined}
                >
                  {w[0]}
                </span>
              )
            })}
          </p>
        ))}
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
        <span className="mushaf-num">{page + 1} / {layout.pages.length}</span>
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
      </div>

      {!timings && (
        <p className="mushaf-note">{t.noTimings}</p>
      )}
    </div>
  )
}
