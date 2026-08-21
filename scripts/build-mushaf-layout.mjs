/**
 * Builds data/mushaf-layout.json — the 15-line Madani page layout.
 *
 * Each page of the King Fahd Complex mushaf has its own font in which every
 * word is a single pre-shaped glyph in the private use area, positioned for
 * that page. So a line is just a string of codepoints, and one span per
 * codepoint gives exact word highlighting with no text shaping to fight.
 *
 * Output per page: the lines, each line's glyph codepoints, and the verse key
 * and word position each glyph belongs to, so audio timings can address them.
 */
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs'

const OUT = 'data/mushaf-layout.json'
const CACHE = '.cache/pages'
const CONCURRENCY = 6

mkdirSync(CACHE, { recursive: true })

async function page(n) {
  const f = `${CACHE}/${n}.json`
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'))
  const url =
    `https://api.quran.com/api/v4/verses/by_page/${n}` +
    `?words=true&per_page=300&word_fields=code_v1,line_number,position,char_type_name,text_uthmani`
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`page ${n}: HTTP ${res.status}`)
  const json = await res.json()
  writeFileSync(f, JSON.stringify(json))
  return json
}

const pages = new Array(605)
const queue = Array.from({ length: 604 }, (_, i) => i + 1)
const failures = []

async function run() {
  for (;;) {
    const n = queue.shift()
    if (!n) return
    try {
      const { verses } = await page(n)
      const lines = new Map()
      for (const v of verses) {
        for (const w of v.words || []) {
          const ln = w.line_number
          if (!lines.has(ln)) lines.set(ln, [])
          lines.get(ln).push({
            t: w.text_uthmani || w.code_v1,
            end: w.char_type_name === 'end',
            k: `${v.verse_key}:${w.position}`,
          })
        }
      }
      pages[n] = [...lines.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([line, glyphs]) => ({
          n: line,
          // One entry per word: its Uthmani text, and the key that audio
          // timings address it by. Ayah-end markers carry no timing.
          w: glyphs.map((g) => (g.end ? [g.t] : [g.t, g.k])),
        }))
    } catch (e) {
      failures.push({ n, error: e.message })
    }
    const done = 604 - queue.length - failures.length
    if (done % 50 === 0) console.log(`  ${done}/604 …`)
  }
}

console.log('Fetching 604 mushaf pages from api.quran.com')
await Promise.all(Array.from({ length: CONCURRENCY }, run))

if (failures.length) {
  console.error(`${failures.length} pages failed:`, failures.slice(0, 5))
  process.exit(1)
}

const out = { version: 'madani-15-lines-uthmani', pages: pages.slice(1) }
writeFileSync(OUT, JSON.stringify(out))
const glyphs = out.pages.flat().reduce((a, l) => a + l.w.length, 0)
console.log(`\nwrote ${OUT}`)
console.log(`pages ${out.pages.length}, glyphs ${glyphs}`)
