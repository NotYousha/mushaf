/**
 * Builds data/divisions.json — where every juz, hizb and rub' begins.
 *
 * These are divisions of the text, not of the printing: a juz starts at an
 * ayah, and the page it lands on is a consequence of the layout. So they are
 * taken from the same quran.com pages that built data/mushaf-layout.json,
 * which are already in .cache/pages — every verse there carries its juz, hizb
 * and rub' number alongside its page.
 *
 * Deriving them rather than typing them matters because the alternative is
 * transcribing a 240-row table of scripture boundaries from memory. The juz
 * table is the one part that can be checked against something independent —
 * the thirty pages a printed Madani mushaf starts its juz on are fixed and
 * widely published — so it is, and the build fails if they disagree.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const CACHE = '.cache/pages'
const OUT = 'data/divisions.json'
const PAGES = 604

/**
 * The page each juz starts on in the printed Madani mushaf.
 *
 * Not an input — a check. If what we derive from the verse data disagrees
 * with the printed mushaf, one of the two is wrong and neither should be
 * shipped silently.
 */
const PRINTED_JUZ_PAGES = [
  1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282, 302,
  322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
]

const verses = []
for (let p = 1; p <= PAGES; p++) {
  const f = `${CACHE}/${p}.json`
  if (!existsSync(f)) {
    console.error(`missing ${f} — run build-mushaf-layout.mjs first`)
    process.exit(1)
  }
  for (const v of JSON.parse(readFileSync(f, 'utf8')).verses) {
    const [surah, ayah] = v.verse_key.split(':').map(Number)
    verses.push({
      surah,
      ayah,
      key: v.verse_key,
      /*
       * The page it was listed under, not the `page_number` it carries.
       *
       * Those two disagree, and the field is the one that is wrong: 100:9 is
       * returned by by_page/599, its words are printed on page 599 in the
       * layout, and its own page_number says 600. The listing and the layout
       * agree with each other and with the printed mushaf, so the field is
       * ignored. Pages are read in ascending order, so the first sighting of
       * a verse is the page it begins on.
       */
      page: p,
      juz: v.juz_number,
      hizb: v.hizb_number,
      rub: v.rub_el_hizb_number,
      sajdah: v.sajdah_number ?? null,
    })
  }
}

// A page can be fetched more than once across surah boundaries; keep the
// first sighting of each ayah and read them in mushaf order.
const seen = new Set()
const ordered = []
for (const v of verses) {
  if (seen.has(v.key)) continue
  seen.add(v.key)
  ordered.push(v)
}
ordered.sort((a, b) => a.surah - b.surah || a.ayah - b.ayah)

/** The first ayah carrying each value of a division, in mushaf order. */
const firsts = (field, count) => {
  const out = new Map()
  for (const v of ordered) if (!out.has(v[field])) out.set(v[field], v)
  const missing = []
  for (let n = 1; n <= count; n++) if (!out.has(n)) missing.push(n)
  if (missing.length) {
    console.error(`${field}: no start found for ${missing.join(', ')}`)
    process.exit(1)
  }
  return Array.from({ length: count }, (_, i) => out.get(i + 1))
}

const juzStarts = firsts('juz', 30)
const hizbStarts = firsts('hizb', 60)
const rubStarts = firsts('rub', 240)

for (let i = 0; i < 30; i++) {
  if (juzStarts[i].page !== PRINTED_JUZ_PAGES[i]) {
    console.error(
      `juz ${i + 1} starts at ${juzStarts[i].key} on page ${juzStarts[i].page}, ` +
        `but the printed mushaf starts it on page ${PRINTED_JUZ_PAGES[i]}`,
    )
    process.exit(1)
  }
}

/** The page each surah begins on, indexed 0 for surah 1. */
const surahPages = []
for (const v of ordered) {
  if (v.ayah === 1 && surahPages[v.surah - 1] === undefined) {
    surahPages[v.surah - 1] = v.page
  }
}
if (surahPages.length !== 114 || surahPages.some((p) => !p)) {
  console.error('a surah has no start page')
  process.exit(1)
}

/** Every surah appearing on each page, in order, indexed 0 for page 1. */
const pageSurahs = Array.from({ length: PAGES }, () => [])
/** The juz and hizb each page falls in — its first ayah's. */
const pageJuz = new Array(PAGES)
const pageHizb = new Array(PAGES)
for (const v of ordered) {
  const i = v.page - 1
  const on = pageSurahs[i]
  if (on[on.length - 1] !== v.surah) on.push(v.surah)
  if (pageJuz[i] === undefined) {
    pageJuz[i] = v.juz
    pageHizb[i] = v.hizb
  }
}
for (let i = 0; i < PAGES; i++) {
  if (!pageSurahs[i].length || pageJuz[i] === undefined) {
    console.error(`page ${i + 1} has no verses`)
    process.exit(1)
  }
}

/**
 * Where the reader may prostrate, so the page can mark it.
 *
 * Fourteen, not fifteen. The verse data marks the places every school agrees
 * on; the second sajdah of Al-Hajj (22:77) is recited as one by some and not
 * by others, and it is not marked here. Nothing in the app claims otherwise.
 */
const sajdas = ordered
  .filter((v) => v.sajdah !== null)
  .map((v) => ({ key: v.key, page: v.page }))

const trim = (v) => ({ n: 0, start: v.key, page: v.page })
const out = {
  version: 'madani-604',
  source:
    'quran.com API v4 verse metadata, cross-checked against the printed juz pages',
  juz: juzStarts.map((v, i) => ({ ...trim(v), n: i + 1 })),
  hizb: hizbStarts.map((v, i) => ({ ...trim(v), n: i + 1, juz: v.juz })),
  rub: rubStarts.map((v, i) => ({ ...trim(v), n: i + 1, hizb: v.hizb })),
  surahPages,
  pageSurahs,
  pageJuz,
  pageHizb,
  sajdas,
}

writeFileSync(OUT, JSON.stringify(out))
console.log(
  `${OUT}: 30 juz, 60 hizb, 240 rub', 114 surah pages, ${sajdas.length} sajdas`,
)
