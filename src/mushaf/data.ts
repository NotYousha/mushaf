/**
 * The mushaf page layout and the word timings that address it.
 *
 * Both are large and neither is needed to start playing, so they load as lazy
 * chunks and are shared: the page view and Talqeen Mode read the same copy
 * rather than each pulling 2.6 MB of layout.
 */

/** One word: its Uthmani text, and the key timings address it by. An ayah-end
 *  marker has no key. */
export type Word = [string] | [string, string]
export type Line = { n: number; w: Word[] }
export type Layout = { version: string; pages: Line[][] }
/** Per surah: [ayah, [word start times in ms]] */
export type Timings = {
  unit: string
  source: string
  surahs: Record<string, [number, number[]][]>
}

let layoutPromise: Promise<Layout> | null = null
const timingCache = new Map<string, Promise<Timings | null>>()
/** Resolved timings, once loaded, so other parts of the app can step by ayah
 *  without forcing the download themselves. */
const loadedTimings = new Map<string, Timings>()

export const loadLayout = () => {
  layoutPromise ??= import('../../data/mushaf-layout.json').then(
    (m) => m.default as unknown as Layout,
  )
  return layoutPromise
}

/** Only reciters with published word timings can be followed word by word. */
export const loadTimings = (reciterId: string) => {
  if (!timingCache.has(reciterId)) {
    timingCache.set(
      reciterId,
      reciterId === 'burhaji-nabawi'
        ? import('../../data/timings-burhaji-nabawi.json').then(
            (m) => m.default as unknown as Timings,
          )
        : Promise.resolve(null),
    )
    void timingCache.get(reciterId)!.then((t) => {
      if (t) loadedTimings.set(reciterId, t)
    })
  }
  return timingCache.get(reciterId)!
}

export const hasTimings = (reciterId: string) => reciterId === 'burhaji-nabawi'

/** Ayah start times in ms for a surah, or null if timings are not loaded. */
export function ayahStartsFor(reciterId: string, surah: number): number[] | null {
  const t = loadedTimings.get(reciterId)
  const verses = t?.surahs[String(surah)]
  if (!verses) return null
  return verses.map(([, starts]) => starts[0]).filter((n) => typeof n === 'number')
}

/** Every word of a surah in order, with the time it begins, in ms. */
export function wordSchedule(
  timings: Timings | null,
  surah: number | null,
): { at: number; key: string }[] {
  if (!timings || !surah) return []
  const verses = timings.surahs[String(surah)]
  if (!verses) return []
  const out: { at: number; key: string }[] = []
  for (const [ayah, starts] of verses) {
    starts.forEach((at, i) => out.push({ at, key: `${surah}:${ayah}:${i + 1}` }))
  }
  return out.sort((a, b) => a.at - b.at)
}

/** A stretch of recitation with a start and an end, both in seconds. */
export type Segment = {
  /** Index of the mushaf page this line sits on. */
  page: number
  /** Line number within that page, 1–15. */
  line: number
  start: number
  end: number
}

/**
 * The lines of a surah as timed segments, in recitation order.
 *
 * A line of the printed page is the unit a hafiz actually memorises — an ayah
 * is the wrong unit here, because a single ayah of Al-Baqarah can run over a
 * minute, far past what anyone can hold and repeat back.
 *
 * A line's end is the next line's start, so the segments are contiguous and
 * nothing is skipped. The last line has no following start, so it runs to
 * `until` — the surah's duration.
 */
export function lineSegments(
  layout: Layout | null,
  timings: Timings | null,
  surah: number | null,
  until: number,
): Segment[] {
  if (!layout || !timings || !surah) return []
  const starts = new Map<string, number>()
  for (const { at, key } of wordSchedule(timings, surah)) {
    if (!starts.has(key)) starts.set(key, at)
  }
  if (!starts.size) return []

  const prefix = `${surah}:`
  const found: Omit<Segment, 'end'>[] = []
  layout.pages.forEach((lines, page) => {
    for (const line of lines) {
      // The first word of this line that belongs to this surah and is timed.
      // Lines shared with a neighbouring surah still start correctly, because
      // words of the other surah simply are not in `starts`.
      let first: number | null = null
      for (const w of line.w) {
        const key = w[1]
        if (!key || !key.startsWith(prefix)) continue
        const at = starts.get(key)
        if (at === undefined) continue
        if (first === null || at < first) first = at
      }
      if (first !== null) found.push({ page, line: line.n, start: first / 1000 })
    }
  })

  found.sort((a, b) => a.start - b.start)
  return found.map((f, i) => ({
    ...f,
    end: i + 1 < found.length ? found[i + 1].start : until,
  }))
}

/** The segment covering a moment, or the nearest one before it. */
export function segmentAt(segments: Segment[], seconds: number): number {
  let lo = 0
  let hi = segments.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (segments[mid].start <= seconds) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}
