/**
 * Builds data/voices.json — which imam recited which surah.
 *
 *   node scripts/build-voices.mjs
 *
 * WHERE THIS COMES FROM
 *
 * Nothing in the audio says it. The archive items carry no ID3 and no
 * per-file metadata; tilawatalharamain's own reciter column is an ellipsis on
 * 113 of 114 rows; the YouTube titles are one boilerplate line repeated.
 *
 * The video *descriptions* carry it, as a hashtag: #بدر_التركي. The one row
 * the site does fill in — surah 67, Badr Al-Turki — agrees with the hashtag on
 * that surah's video, which is what makes this trustworthy rather than a
 * guess.
 *
 * Only the Grand Mosque's 1446 and 1447 are published this way. The Prophet's
 * Mosque collections are uploaded by someone else and their descriptions carry
 * nothing but generic tags, so those years stay unattributed.
 *
 * A surah spanning several nights genuinely has several reciters — Al-Baqarah
 * always does — and its description lists them all. That is recorded as it is
 * rather than flattened to one name.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** collection id on tilawatalharamain, per mosque and year. */
const SOURCES = [
  { place: 'makkah', year: 1447, collection: 61 },
  { place: 'makkah', year: 1446, collection: 49 },
]

const imams = JSON.parse(readFileSync('data/imams.json', 'utf8'))
const MATCHERS = Object.entries(imams)
  .map(([id, who]) => ({ id, place: who.serves ?? [], keys: [who.match, who.name].filter(Boolean) }))
  .sort((a, b) => Math.max(...b.keys.map((k) => k.length)) - Math.max(...a.keys.map((k) => k.length)))

/** Compare on letters alone: the tags drop the spacing and the ال prefixes vary. */
const bare = (s) => s.replace(/[^ء-ي]/g, '')

function idFor(tag, place) {
  const t = bare(tag)
  for (const m of MATCHERS) {
    if (!m.place.includes(place)) continue
    if (m.keys.some((k) => t.includes(bare(k)) || bare(k).includes(t))) return m.id
  }
  return null
}

const page = async (url, attempts = 4) => {
  let last
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(90_000),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.text()
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i))
    }
  }
  throw last
}

async function videoIds(collection) {
  const html = await page(`https://tilawatalharamain.com/quran/c/${collection}`)
  const out = []
  const seen = new Set()
  const re = /\/quran\/(\d+)"[\s\S]{0,220}?img\.youtube\.com\/vi\/([A-Za-z0-9_-]{6,})\//g
  let m
  while ((m = re.exec(html))) {
    if (seen.has(m[1])) continue
    seen.add(m[1])
    out.push(m[2])
  }
  return out
}

async function imamsFor(video, place) {
  const watch = await page(`https://www.youtube.com/watch?v=${video}`)
  const d = /"shortDescription":"((?:[^"\\]|\\.)*)"/.exec(watch)
  if (!d) return null
  const text = JSON.parse(`"${d[1]}"`)
  const tags = [...text.matchAll(/#([ء-ي_]{4,})/g)].map((x) => x[1].replace(/_/g, ' '))
  const ids = []
  for (const tag of tags) {
    const id = idFor(tag, place)
    // The channel's own tags sit alongside the names and match nobody.
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

const out = {}
for (const src of SOURCES) {
  const key = `${src.place}-${src.year}`
  const vids = await videoIds(src.collection)
  if (vids.length !== 114) {
    console.error(`${key}: collection lists ${vids.length} videos, not 114 — skipping`)
    continue
  }

  const found = new Map()
  const misses = []
  const queue = vids.map((v, i) => ({ v, surah: i + 1 }))
  async function run() {
    for (;;) {
      const job = queue.shift()
      if (!job) return
      try {
        const ids = await imamsFor(job.v, src.place)
        if (ids && ids.length) found.set(job.surah, ids)
        else misses.push(job.surah)
      } catch {
        misses.push(job.surah)
      }
      const done = found.size + misses.length
      if (done % 20 === 0) console.log(`  ${key}: ${done}/114 …`)
    }
  }
  await Promise.all(Array.from({ length: 5 }, run))

  console.log(`${key}: attributed ${found.size}/114` + (misses.length ? `, no name for ${misses.length}` : ''))
  if (misses.length) console.log(`  unattributed surahs: ${misses.sort((a, b) => a - b).join(', ')}`)

  // Below this there is not enough to be worth showing, and a half-filled
  // column reads as though the blanks mean something.
  if (found.size < 80) {
    console.error(`${key}: too few attributed to publish`)
    continue
  }
  out[key] = Object.fromEntries([...found.entries()].sort((a, b) => a[0] - b[0]))
}

writeFileSync('data/voices.json', JSON.stringify(out, null, 1) + '\n')

console.log('\nwrote data/voices.json')
for (const [key, map] of Object.entries(out)) {
  const counts = new Map()
  for (const ids of Object.values(map)) for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  const solo = Object.values(map).filter((v) => v.length === 1).length
  console.log(
    `  ${key}: ${Object.keys(map).length} surahs, ${solo} with a single reciter\n` +
      [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `      ${imams[id].nameEn.padEnd(24)} ${n}`)
        .join('\n'),
  )
}
