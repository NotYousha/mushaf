/**
 * Builds data/haram-years.json — every year of the Grand Mosque's mushaf.
 *
 * Each year is assembled from that Ramadan's Taraweeh and Tahajjud and lives
 * on archive.org as item Mecca{year}, 114 files named 001.mp3 .. 114.mp3.
 * Thirty-three years are published, 1414 through 1447.
 *
 * WHY THIS FILE IS NOT SHAPED LIKE data/catalog.json
 *
 * The catalog stores one object per surah — url, bytes, fallbackUrl, verified
 * — which costs about 226 bytes each. Thirty-three years is 3,762 surahs, so
 * the same shape would add roughly 850 KB to a file that load.ts imports
 * straight into the JS bundle and every visitor downloads before the app
 * paints. Only the byte count actually varies per surah here: the URL is a
 * pure function of year and surah. So a year is stored as its number, its
 * imams and a flat array of 114 sizes, and src/catalog/haram.ts expands that
 * into ordinary Reciter objects at load. Same types downstream, a thirtieth
 * of the bytes.
 *
 *   node scripts/build-haram-years.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FIRST = 1414
const LAST = 1447
/** Its item is missing surah 12, and a mushaf with a hole is not a mushaf. */
const SKIP = new Set([1416])

const CONCURRENCY = 4
const item = (year) => `Mecca${year}`
const fileUrl = (year, surah) =>
  `https://archive.org/download/${item(year)}/${String(surah).padStart(3, '0')}.mp3`

const imams = JSON.parse(readFileSync('data/imams.json', 'utf8'))

/**
 * The imams the item itself names for that year.
 *
 * Names sit in separate elements, so every tag is a boundary — splitting on
 * commas alone runs adjacent names together into one string.
 *
 * This is per-year truth, not boilerplate: 1428 names Ash-Shuraim and not
 * Baleela, Ad-Dosari or Ash-Shamsan, which is right for 2007, and the
 * Prophet's Mosque items name an entirely different set.
 */
const namesFrom = (html) =>
  String(html || '')
    .replace(/<[^>]+>/g, '|')
    .split(/[|,،"]/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 3)

/** Match a source name to a roster id on its distinctive final token. */
function idFor(name) {
  for (const [id, who] of Object.entries(imams)) {
    const key = who.match ?? who.name.split(' ').pop()
    if (name.includes(key)) return id
  }
  return null
}

async function yearData(year) {
  const res = await fetch(`https://archive.org/metadata/${item(year)}`, {
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) throw new Error(`metadata HTTP ${res.status}`)
  const meta = await res.json()

  const sizes = new Map(
    (meta.files || [])
      .filter((f) => /^\d{3}\.mp3$/.test(f.name))
      .map((f) => [Number(f.name.slice(0, 3)), Number(f.size || 0)]),
  )

  const bytes = []
  for (let s = 1; s <= 114; s++) {
    const n = sizes.get(s)
    // A year with a hole is refused outright rather than shipped short: a
    // missing surah in a mushaf is not something to discover while reading.
    if (!n) throw new Error(`surah ${s} missing`)
    bytes.push(n)
  }

  // Al-Baqarah is by far the longest surah. If 002 is not the largest file
  // the numbering is shifted, and every surah would play the wrong
  // recitation with nothing on screen to say so. This is the same class of
  // error that put four Burhaji surahs under each other's names, caught here
  // before it can reach a listener.
  const biggest = bytes.indexOf(Math.max(...bytes)) + 1
  if (biggest !== 2) throw new Error(`file numbering looks shifted (largest is ${biggest}, not 2)`)

  const names = namesFrom(meta.metadata?.description)
  const ids = [...new Set(names.map(idFor))]
  const unknown = names.filter((n) => !idFor(n))
  // An unrecognised name is a roster gap and must be fixed, not dropped —
  // silently discarding it would attribute the year to fewer imams than led it.
  if (unknown.length) throw new Error(`unrecognised imam(s): ${unknown.join(' / ')}`)
  // No names at all is a gap in the source rather than one here: a couple of
  // items carry a lone stray quote where the list should be. Said out loud so
  // it is a known hole and not a silent one.
  if (!names.length) console.warn(`  ${year}: item names no imams — shipping the year without them`)

  // The item's own title carries the Gregorian year, so it is read rather
  // than computed — a Hijri year straddles two of them.
  const ce = Number(/(\d{4})\s*ميلادي/.exec(String(meta.metadata?.title || ''))?.[1]) || null

  return { year, ce, imams: ids.filter(Boolean), bytes }
}

const queue = []
for (let y = LAST; y >= FIRST; y--) if (!SKIP.has(y)) queue.push(y)

const done = new Map()
const failed = []

async function run() {
  for (;;) {
    const y = queue.shift()
    if (y === undefined) return
    try {
      done.set(y, await yearData(y))
      console.log(`  ${y} ok`)
    } catch (e) {
      failed.push({ year: y, error: e.message })
      console.error(`  ${y} FAILED — ${e.message}`)
    }
  }
}

console.log(`Building ${LAST - FIRST + 1 - SKIP.size} years from archive.org`)
await Promise.all(Array.from({ length: CONCURRENCY }, run))

if (failed.length) {
  console.error(`\n${failed.length} year(s) failed. Refusing to write a partial file.`)
  process.exit(1)
}

const years = [...done.values()].sort((a, b) => b.year - a.year)
const out = {
  source: 'archive.org item Mecca{year}, uploaded by dhikr365@gmail.com',
  generated: new Date().toISOString().slice(0, 10),
  years,
}

// One year per line keeps a 33-year diff readable; the default indent puts
// every one of 3,762 byte counts on its own line.
const body = years
  .map((y) => `  ${JSON.stringify(y)}`)
  .join(',\n')
writeFileSync(
  'data/haram-years.json',
  `{\n "source": ${JSON.stringify(out.source)},\n "generated": ${JSON.stringify(out.generated)},\n "years": [\n${body}\n ]\n}\n`,
)

const total = years.reduce((a, y) => a + y.bytes.reduce((x, n) => x + n, 0), 0)
console.log(`\n${years.length} years, ${years[years.length - 1].year}–${years[0].year}`)
console.log(`${(total / 1073741824).toFixed(1)} GB of audio catalogued`)
console.log(`data/haram-years.json is ${(readFileSync('data/haram-years.json').length / 1024).toFixed(0)} KB`)
console.log(`first file of the newest year: ${fileUrl(years[0].year, 1)}`)
