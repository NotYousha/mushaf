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

/**
 * Which quarter of its hizb a page falls in, 1–4.
 *
 * A printed mushaf marks the quarters rather than numbering them: the reader
 * is told they are a quarter, a half or three quarters of the way through
 * hizb 8, never that they are in rub' 31 of 240. Nobody says "quarter one
 * hundred and sixty-three".
 */
export const rubInHizb = (page: number): number => {
  const hizb = hizbOfPage(page)
  const quarters = rubsOfHizb(hizb)
  let found = 1
  for (let i = 0; i < quarters.length; i++) {
    if (quarters[i].page <= page) found = i + 1
  }
  return found
}

/**
 * "Juz' 4, ½ Hizb 8" — where you are, as a mushaf's margin says it.
 *
 * The fraction is what has *elapsed*, so the first quarter carries no mark at
 * all: you are at the start of hizb 8, not a quarter into it.
 */
export const FRACTIONS = ['', '¼', '½', '¾'] as const


/**
 * Which juz, hizb and quarter a *verse* falls in.
 *
 * By verse rather than by page, because a page number only means something
 * alongside the edition it came from: an IndoPak mushaf runs to 610 pages and
 * its page 3 is 2:5–2:15 where the Madani's is 2:6–2:16. The divisions
 * themselves are divisions of the text and are the same in every edition, so
 * asking about the ayah gives the right answer for all of them.
 */
const before = (key: string, start: string) => {
  const [s1, a1] = key.split(':').map(Number)
  const [s2, a2] = start.split(':').map(Number)
  return s2 < s1 || (s2 === s1 && a2 <= a1)
}

const lastCovering = <T extends Division>(list: T[], key: string): T => {
  let found = list[0]
  for (const d of list) if (before(key, d.start)) found = d
  return found
}

export const juzOfVerse = (key: string): number => lastCovering(data.juz, key).n
export const hizbOfVerse = (key: string): number => lastCovering(data.hizb, key).n

/** Which quarter of its hizb a verse falls in, 1–4. */
export const rubInHizbOfVerse = (key: string): number => {
  const hizb = hizbOfVerse(key)
  const quarters = rubsOfHizb(hizb)
  let found = 1
  for (let i = 0; i < quarters.length; i++) {
    if (before(key, quarters[i].start)) found = i + 1
  }
  return found
}
