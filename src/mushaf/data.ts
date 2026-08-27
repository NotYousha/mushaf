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
/**
 * How finely a recitation is timed.
 *
 * `word` is what the mushaf wants and what almost nobody publishes: a start
 * time for every word of every ayah. `ayah` is a start time per verse and
 * nothing inside it — far cheaper to produce, and enough to shade the verse
 * being recited even though it cannot box the word.
 *
 * The two share a file format, which is deliberate: an ayah-timed surah is a
 * word-timed one whose `starts` happen to hold a single number. Everything
 * that reads a verse start works on both without knowing which it has.
 */
export type Granularity = 'word' | 'ayah'

/** Per surah: [ayah, [word start times in ms]] */
export type Timings = {
  unit: string
  source: string
  /** Absent means `word`, which is what every file predating this was. */
  granularity?: Granularity
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

/**
 * Reciters we have word timings for.
 *
 * Barhaji's come from the Quranic Universal Audio project. Al-Dosari's are
 * our own, produced by forced alignment against the Uthmani text, and cover
 * only the surahs that have been through it so far — a full mushaf is more
 * than a day of compute on a laptop, so coverage grows rather than arriving
 * complete.
 */
const TIMED: Record<string, { granularity: Granularity; load: () => Promise<Timings> }> = {
  'burhaji-nabawi': {
    granularity: 'word',
    load: () =>
      import('../../data/timings-burhaji-nabawi.json').then(
        (m) => m.default as unknown as Timings,
      ),
  },
  /*
   * Verse timings, from the Quranic Universal Library.
   *
   * These three and no others, because a timing file belongs to a *recording*
   * rather than to a reciter, and almost none of ours are the recordings the
   * published data was made against. Surah 114 runs 52 seconds in our
   * As-Sudais and 26 in the one that was timed: the same sheikh, a different
   * take, and the timings would point confidently at the wrong word.
   *
   * Each of these was checked against its source before being listed —
   * md5-identical for Al-Juhany, frame-identical for Al-Budair, and within a
   * second across five surahs for Ali Jaber. The provenance is written into
   * each file's `source` field.
   */
  budair: {
    granularity: 'ayah',
    load: () =>
      import('../../data/timings-budair.json').then((m) => m.default as unknown as Timings),
  },
  jaber: {
    granularity: 'ayah',
    load: () =>
      import('../../data/timings-jaber.json').then((m) => m.default as unknown as Timings),
  },
  'juhany-hafs': {
    granularity: 'ayah',
    load: () =>
      import('../../data/timings-juhany-hafs.json').then(
        (m) => m.default as unknown as Timings,
      ),
  },
  /**
   * Al-Dosari is deliberately absent.
   *
   * data/timings-dosari.json exists but its `surahs` object is empty — the
   * alignment was started and never finished. Listing him here made the app
   * claim word timings for the reciter it opens with, so a first-time
   * listener met three features that each failed on contact. Put him back the
   * day the file has something in it, and not before.
   */
}

/**
 * Every Taraweeh compilation is absent, and always will be from this route.
 *
 * No word or verse timings exist for any Makkah or Madinah Taraweeh
 * recording, from any published source — QUL lists the recitations and
 * reports no segments for a single one of them. They are one MP3 per surah
 * per year, recorded in the mosque, and nobody has aligned them. The only
 * route is forced alignment here, which is why scripts/align exists.
 */

export const loadTimings = (reciterId: string) => {
  if (!timingCache.has(reciterId)) {
    const entry = TIMED[reciterId]
    timingCache.set(reciterId, entry ? entry.load() : Promise.resolve(null))
    void timingCache.get(reciterId)!.then((t) => {
      if (t) loadedTimings.set(reciterId, t)
    })
  }
  return timingCache.get(reciterId)!
}

/**
 * Whether this reciter has any word timings at all.
 *
 * Registration is not coverage. Al-Dosari was listed in TIMED with an empty
 * set, so this returned true and three features — the mushaf's word
 * following, Talqeen, and the Fork Drill — each went as far as trying before
 * failing, on the reciter the app opens with. The Fork Drill even offered a
 * retry gated on this same check, which could therefore never succeed.
 *
 * A reciter counts as timed only once something has actually loaded for them,
 * so the answer is honest before the file arrives as well as after.
 */
export const hasTimings = (reciterId: string) => {
  if (TIMED[reciterId]?.granularity !== 'word') return false
  const t = loadedTimings.get(reciterId)
  // Not loaded yet: trust the registry, and surahTimed will refuse per surah.
  if (!t) return true
  return Object.keys(t.surahs).length > 0
}

/** Everyone the app can actually follow word by word, for offering a switch. */
export const timedReciters = (): string[] =>
  Object.keys(TIMED).filter((id) => {
    if (TIMED[id].granularity !== 'word') return false
    const t = loadedTimings.get(id)
    return !t || Object.keys(t.surahs).length > 0
  })

/**
 * How finely this recitation of this surah can be followed.
 *
 * The one question every following surface should ask, in place of the
 * boolean it used to. `word` boxes the word, `ayah` shades the verse, and
 * null shows nothing and says nothing.
 *
 * Per surah rather than per reciter, because coverage is per surah: an
 * alignment that has been through forty of them is not a claim about the
 * other seventy-four. It answers null until the file has actually loaded,
 * which is the honest answer at that moment — the alternative is a page that
 * promises to follow and then does not.
 */
export function timingGranularity(
  reciterId: string,
  surah: number | null,
): Granularity | null {
  const entry = TIMED[reciterId]
  if (!entry || surah === null) return null
  const t = loadedTimings.get(reciterId)
  if (!t?.surahs[String(surah)]) return null
  return entry.granularity
}

/**
 * Whether a particular surah is timed.
 *
 * Coverage is per surah, not per reciter, so anything that needs word
 * positions has to ask about the surah in hand rather than assuming a timed
 * reciter is timed everywhere.
 */
export function surahTimed(reciterId: string, surah: number | null): boolean {
  if (surah === null) return false
  const t = loadedTimings.get(reciterId)
  return !!t?.surahs[String(surah)]
}

/**
 * A surah as whole ayahs, read out of the page layout.
 *
 * The app ships no running text — `data/quran-text.json` is a build input and
 * never reaches the browser. The layout is the only Quran text here, and it
 * is words in printed lines, so anything that wants an ayah has to put one
 * back together. Doing that here rather than shipping a second copy of the
 * whole Quran saves 1.4 MB and, more importantly, means the translation view
 * and the printed page can never drift apart: same words, same orthography,
 * one source.
 */
export function ayahsOfSurah(
  layout: Layout | null,
  surah: number | null,
): { ayah: number; text: string }[] {
  if (!layout || !surah) return []
  const prefix = `${surah}:`
  const out: { ayah: number; text: string }[] = []
  for (const lines of layout.pages) {
    for (const line of lines) {
      for (const w of line.w) {
        const key = w[1]
        if (!key?.startsWith(prefix)) continue
        const ayah = Number(key.split(':')[1])
        const last = out[out.length - 1]
        if (last?.ayah === ayah) last.text += ' ' + w[0]
        else out.push({ ayah, text: w[0] })
      }
    }
  }
  return out
}

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
  /*
   * Nothing, for a verse-timed recitation.
   *
   * A verse-timed file is a word-timed one whose `starts` hold a single
   * number, so this would happily return one entry per ayah — and every
   * consumer would then treat the first word of each ayah as the only word
   * being recited. The mushaf would box a word and leave it boxed for a
   * minute; Talqeen would call a whole ayah of Al-Baqarah one line and ask
   * you to repeat it. Refusing here is what makes those features degrade to
   * off rather than to wrong.
   */
  if (timings.granularity === 'ayah') return []
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

/**
 * Which printed page a word sits on, 1-based as the mushaf numbers them.
 *
 * Built once from the layout and kept, because practice records are written
 * from the player as well as from the page view, and the player has no other
 * way to know where in the mushaf it currently is.
 */
let pageIndex: Map<string, number> | null = null

export async function pageForKey(key: string): Promise<number> {
  if (!pageIndex) {
    const layout = await loadLayout()
    const m = new Map<string, number>()
    layout.pages.forEach((lines, p) => {
      for (const line of lines) for (const w of line.w) if (w[1]) m.set(w[1], p + 1)
    })
    pageIndex = m
  }
  return pageIndex.get(key) ?? 0
}
