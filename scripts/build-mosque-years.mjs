/**
 * Builds data/mosque-years.json — the Grand Mosque and the Prophet's Mosque,
 * one entry per Ramadan, from archive.org items Mecca{year} / Nabawi{year}.
 *
 *   node scripts/build-mosque-years.mjs
 *
 * WHY YEARS ARE EXCLUDED
 *
 * The uploader's items are not all what they claim. Comparing every item
 * against every other by its 114 durations — identical audio agrees to the
 * second — found four years where the Makkah and Madinah items hold the same
 * recording, and an independent source (tilawatalharamain, which publishes
 * both mosques by year) settled 1441: the shared audio matches its Makkah
 * copy to 0.1% and differs from its Madinah copy by 4-9%. So for that pair it
 * is the Madinah item that is wrong, not the Makkah one.
 *
 * Running the catalog's own seconds-per-letter check across every item found
 * three more that cannot be what they say: two Madinah years at roughly half
 * the pace of every other year, and two items with a dozen or more surahs far
 * from their own median, which is what a shifted or mixed item looks like.
 *
 * Every exclusion below is one of those, or a listener's report. None is a
 * guess about content nobody has checked.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const MOSQUES = {
  makkah: {
    item: (y) => `Mecca${y}`,
    route: 'haram',
    first: 1414,
    last: 1447,
    exclude: {
      // Its item is missing surah 12 outright.
      1416: 'incomplete — surah 12 is absent from the item',
      // Twelve surahs sit far from this item's own median, which is what a
      // shifted or mixed item looks like rather than a fast reciter.
      1430: 'twelve surahs disagree with the item\'s own pace',
      // Reported by a listener as a different reciter. The audio is a normal
      // length and duplicates nothing, so nothing here could have caught it,
      // and top4top — where the independent copy lives — is unreachable from
      // some networks, this one included. An ear beats an unverifiable claim.
      1443: 'a listener reports this is not the Grand Mosque recitation',
    },
  },
  madinah: {
    item: (y) => `Nabawi${y}`,
    route: 'nabawi',
    first: 1415,
    last: 1447,
    exclude: {
      1441: 'holds the Makkah recording — proven against an independent copy',
      // The same duplication, unarbitrable because the independent source
      // publishes neither mosque for these years. 1441 shows the uploader's
      // error runs this way round, so the Makkah side is kept and this is not.
      1423: 'holds the same audio as the Makkah item for this year',
      1422: 'holds the same audio as the Makkah item for this year',
      1421: 'holds the same audio as the Makkah item for this year',
      // Roughly half the seconds per letter of every other year: not a quick
      // reciter, a recording that is not the whole thing.
      1446: 'runs at half the pace of every other year — not a full mushaf',
      1443: 'runs at half the pace of every other year — not a full mushaf',
      1415: 'twenty surahs disagree with the item\'s own pace',
      // Al-Baqarah is not the largest file here, so the numbering is shifted
      // and every surah would play under the wrong name.
      1437: 'file numbering is shifted — the largest file is not Al-Baqarah',
    },
  },
}

const imams = JSON.parse(readFileSync('data/imams.json', 'utf8'))
const text = JSON.parse(readFileSync('data/quran-text.json', 'utf8'))
const lettersIn = (s) => (text[String(s)] || []).join(' ').replace(/[^ء-ي]/g, '').length
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

/**
 * Names sit in separate elements, so every tag is a boundary.
 *
 * Anything with no Arabic letters is not a name here — one item's description
 * is an English sentence, which would otherwise be carried in as an imam.
 */
const namesFrom = (html) =>
  String(html || '')
    .replace(/<[^>]+>/g, '|')
    .split(/[|,،"]/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 3 && /[ء-ي]/.test(s))

/**
 * Longest key first, so a shorter name cannot shadow a longer one containing
 * it — the same reason matchFilename sorts before matching. Ali and Ahmad
 * Al-Hudhaify are father and son, and Ahmad's full name ends in Ali's.
 */
const MATCHERS = Object.entries(imams)
  .map(([id, who]) => ({ id, key: who.match ?? who.name.split(' ').pop() }))
  .sort((a, b) => b.key.length - a.key.length)

const idFor = (name) => MATCHERS.find((m) => name.includes(m.key))?.id ?? null

async function yearData(mosque, year) {
  const id = mosque.item(year)
  const res = await fetch(`https://archive.org/metadata/${id}`, {
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) throw new Error(`metadata HTTP ${res.status}`)
  const meta = await res.json()

  const files = (meta.files || []).filter((f) => /^\d{3}\.mp3$/.test(f.name))
  const bytesBy = new Map(files.map((f) => [Number(f.name.slice(0, 3)), Number(f.size || 0)]))
  const secsBy = new Map(files.map((f) => [Number(f.name.slice(0, 3)), Number(f.length || 0)]))

  const bytes = []
  for (let s = 1; s <= 114; s++) {
    const n = bytesBy.get(s)
    if (!n) throw new Error(`surah ${s} missing`)
    bytes.push(n)
  }

  // Al-Baqarah is by far the longest surah. If 002 is not the largest file the
  // numbering is shifted, and every surah plays under the wrong name with
  // nothing on screen to say so.
  const biggest = bytes.indexOf(Math.max(...bytes)) + 1
  if (biggest !== 2) throw new Error(`numbering looks shifted (largest is ${biggest}, not 2)`)

  // The same check the refresh runs, applied to the item as a whole. A year
  // that fails it is not published, whatever its title says.
  const rates = []
  for (let s = 1; s <= 114; s++) {
    const d = secsBy.get(s)
    const L = lettersIn(s)
    if (d && L >= 150) rates.push({ s, r: d / L })
  }
  if (rates.length >= 30) {
    const med = median(rates.map((x) => x.r))
    const off = rates.filter((x) => x.r / med > 1.45 || x.r / med < 0.69)
    if (off.length > 8) {
      throw new Error(`${off.length} surahs disagree with the item's own pace`)
    }
  }

  const names = namesFrom(meta.metadata?.description)
  const unknown = names.filter((n) => !idFor(n))
  if (unknown.length) throw new Error(`unrecognised imam(s): ${unknown.join(' / ')}`)
  if (!names.length) console.warn(`    ${id}: names no imams`)

  const ce = Number(/(\d{4})\s*ميلادي/.exec(String(meta.metadata?.title || ''))?.[1]) || null
  const secs = Array.from({ length: 114 }, (_, i) => Math.round(secsBy.get(i + 1) || 0))

  return { year, ce, imams: [...new Set(names.map(idFor))].filter(Boolean), bytes, secs }
}

const out = {}
for (const [key, mosque] of Object.entries(MOSQUES)) {
  const queue = []
  for (let y = mosque.last; y >= mosque.first; y--) if (!mosque.exclude[y]) queue.push(y)

  console.log(`\n${key}: ${queue.length} candidate years`)
  const done = new Map()
  const failed = []
  async function run() {
    for (;;) {
      const y = queue.shift()
      if (y === undefined) return
      try {
        done.set(y, await yearData(mosque, y))
      } catch (e) {
        failed.push({ year: y, error: e.message })
        console.error(`    ${y} REJECTED — ${e.message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, run))
  if (failed.length) {
    console.error(`\n${key}: ${failed.length} year(s) failed a check. Refusing to write.`)
    console.error('Add them to the exclude list with a reason, or fix the check.')
    process.exit(1)
  }
  out[key] = [...done.values()].sort((a, b) => b.year - a.year)
  for (const [y, why] of Object.entries(mosque.exclude)) console.log(`    ${y} excluded: ${why}`)
  console.log(`  ${out[key].length} years published`)
}

const doc = {
  source: 'archive.org items Mecca{year} and Nabawi{year}, uploaded by dhikr365@gmail.com',
  generated: new Date().toISOString().slice(0, 10),
  excluded: Object.fromEntries(
    Object.entries(MOSQUES).map(([k, m]) => [k, m.exclude]),
  ),
  mosques: out,
}

const line = (y) => `   ${JSON.stringify(y)}`
const body = Object.entries(out)
  .map(([k, ys]) => `  ${JSON.stringify(k)}: [\n${ys.map(line).join(',\n')}\n  ]`)
  .join(',\n')
writeFileSync(
  'data/mosque-years.json',
  `{\n "source": ${JSON.stringify(doc.source)},\n "generated": ${JSON.stringify(doc.generated)},\n "excluded": ${JSON.stringify(doc.excluded)},\n "mosques": {\n${body}\n }\n}\n`,
)

let total = 0
for (const ys of Object.values(out)) for (const y of ys) total += y.bytes.reduce((a, b) => a + b, 0)
console.log(`\n${Object.values(out).reduce((a, y) => a + y.length, 0)} years published`)
console.log(`${(total / 1073741824).toFixed(1)} GB catalogued`)
console.log(`data/mosque-years.json is ${(readFileSync('data/mosque-years.json').length / 1024).toFixed(0)} KB`)
