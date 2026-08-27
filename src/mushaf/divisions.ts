/**
 * Where you are in the mushaf, in the terms the mushaf itself uses.
 *
 * A page is not just a number. It sits in a juz, in a hizb, in a quarter of
 * that hizb, and it shows one or two surahs — and every reading surface here
 * needs to say so: the full-screen page prints the juz and the surah in its
 * margins, the surah list groups under juz headings, and the translation view
 * carries all of it in one line.
 *
 * Small enough (22 KB) to bundle rather than fetch. The 2.6 MB page layout is
 * lazy for good reason; this is not, because the surah list needs it before
 * anything has been opened.
 */
import divisions from '../../data/divisions.json'

export type Division = { n: number; start: string; page: number }
export type Hizb = Division & { juz: number }
export type Rub = Division & { hizb: number }

const data = divisions as unknown as {
  version: string
  source: string
  juz: Division[]
  hizb: Hizb[]
  rub: Rub[]
  surahPages: number[]
  pageSurahs: number[][]
  pageJuz: number[]
  pageHizb: number[]
  sajdas: { key: string; page: number }[]
}

export const PAGES = data.pageJuz.length

export const juz = data.juz
export const hizbs = data.hizb
export const rubs = data.rub
export const sajdas = data.sajdas

/** The page a surah begins on, 1-based both ways. */
export const surahPage = (surah: number): number =>
  data.surahPages[surah - 1] ?? 1

/** Every surah with any ayah on this page, in reading order. */
export const surahsOnPage = (page: number): number[] =>
  data.pageSurahs[page - 1] ?? []

/**
 * The surah to name at the top of a page.
 *
 * Where a page carries two, it is the later one — the reader has finished the
 * first and is reading into the second, and naming the one they have left
 * behind puts the wrong name over most of the page in front of them.
 */
export const surahOfPage = (page: number): number => {
  const on = surahsOnPage(page)
  return on[on.length - 1] ?? 1
}

export const juzOfPage = (page: number): number => data.pageJuz[page - 1] ?? 1
export const hizbOfPage = (page: number): number => data.pageHizb[page - 1] ?? 1

/** The pages a juz spans, as a first and last, 1-based inclusive. */
export const pagesOfJuz = (n: number): [number, number] => {
  const start = data.juz[n - 1]?.page ?? 1
  const end = n >= data.juz.length ? PAGES : (data.juz[n]?.page ?? PAGES) - 1
  return [start, Math.max(start, end)]
}

/** The two hizbs of a juz. */
export const hizbsOfJuz = (n: number): Hizb[] =>
  data.hizb.filter((h) => h.juz === n)

/** The four quarters of a hizb. */
export const rubsOfHizb = (n: number): Rub[] =>
  data.rub.filter((r) => r.hizb === n)

/**
 * The surahs that begin inside a juz, plus the one it opens partway through.
 *
 * A juz heading with only the surahs that *start* in it would leave Juz' 2
 * empty — it opens in the middle of Al-Baqarah and no surah begins in it at
 * all. So the surah in progress is listed first, which is also how a reader
 * thinks about it: juz 2 is the middle of Al-Baqarah.
 */
export const surahsOfJuz = (n: number): number[] => {
  const [first, last] = pagesOfJuz(n)
  const out: number[] = []
  for (let p = first; p <= last; p++) {
    for (const s of surahsOnPage(p)) if (!out.includes(s)) out.push(s)
  }
  return out
}

/**
 * Which juz to file a surah under in a grouped list.
 *
 * The juz its first ayah falls in. A surah spanning four juz is listed once,
 * where it starts, because a list that repeats Al-Baqarah under juz 1, 2 and
 * 3 is three rows for one surah.
 */
export const juzOfSurah = (surah: number): number => juzOfPage(surahPage(surah))

/** The page a verse key sits on, for jumping to a place named as `4:173`. */
export const pageOfDivision = (d: Division): number => d.page

/**
 * What this edition calls a juz.
 *
 * IndoPak mushafs across South Asia call the same thirtieth a *para*, and a
 * reader who has used one all their life does not recognise "Juz' 6". The
 * division is identical; only the word changes.
 */
export type UnitWord = 'juz' | 'para'
