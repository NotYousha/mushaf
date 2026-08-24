/**
 * Adds the Grand Mosque's 1447 mushaf to data/catalog.json.
 *
 * Assembled from that Ramadan's Taraweeh and Tahajjud, and hosted on
 * archive.org as item Mecca1447: 114 files named 001.mp3 through 114.mp3.
 *
 * Sized directly from archive.org rather than through the Worker, unlike
 * add-nabawi.mjs. The proxy exists to solve a browser problem — archive
 * sends Access-Control-Allow-Origin: * but no Access-Control-Expose-Headers,
 * and neither ETag nor Content-Range is CORS-safelisted, so a browser reads
 * null for both and cannot size or resume a download. Node has no such
 * limit, so measuring here would only be testing the proxy, not the audio.
 * The catalog URLs still point at the proxy, because that is what the app
 * has to use.
 *
 * Run once. Ramadan 1447 is over, so nothing about this entry changes.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const WORKER = process.env.WORKER_URL ?? 'https://mushaf-audio.mushaftarteel.workers.dev'
const ITEM = 'https://archive.org/download/Mecca1447'
const CONCURRENCY = 6

/** Files are named 001.mp3 .. 114.mp3 — the same pattern the Worker resolves. */
const fileFor = (surah) => `${ITEM}/${String(surah).padStart(3, '0')}.mp3`

/**
 * Total size, plus proof the file is actually range-servable.
 *
 * A missing ETag is fatal rather than cosmetic: without a validator
 * fetchRange omits If-Range, so a resumed download cannot detect that the
 * file changed and would splice two recordings into one surah.
 */
async function sizeOf(surah) {
  const res = await fetch(fileFor(surah), {
    headers: { Range: 'bytes=0-1' },
    signal: AbortSignal.timeout(90_000),
  })
  if (res.status !== 206) throw new Error(`expected 206, got ${res.status}`)
  const cr = res.headers.get('content-range')
  const total = cr ? Number(/\/(\d+)\s*$/.exec(cr)?.[1]) : 0
  if (!total) throw new Error('no Content-Range')
  if (!res.headers.get('etag')) throw new Error('no ETag')
  // Drain so the connection is released promptly.
  await res.arrayBuffer().catch(() => {})
  return total
}

const results = new Map()
const failures = []
const queue = Array.from({ length: 114 }, (_, i) => i + 1)

async function worker() {
  for (;;) {
    const surah = queue.shift()
    if (surah === undefined) return
    try {
      results.set(surah, await sizeOf(surah))
    } catch (e) {
      failures.push({ surah, error: e.message })
    }
    const done = results.size + failures.length
    if (done % 20 === 0) console.log(`  ${done}/114 …`)
  }
}

console.log(`Sizing 114 surahs from ${ITEM}`)
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

if (failures.length) {
  console.error(`\n${failures.length} surah(s) failed:`)
  for (const f of failures.slice(0, 10)) console.error(`  ${f.surah}: ${f.error}`)
  console.error('\nRefusing to write a catalog with holes in it.')
  process.exit(1)
}

const total = [...results.values()].reduce((a, b) => a + b, 0)
console.log(`\nAll 114 resolved. Total ${(total / 1073741824).toFixed(2)} GB`)

const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'))
const entry = {
  id: 'haram-1447',
  name: 'الحرم المكي ١٤٤٧',
  nameEn: 'Grand Mosque 1447',
  fullName: 'تراويح وتهجد الحرم المكي ١٤٤٧',
  mushaf: 'المصحف الصوتي من صلاتي التراويح والتهجد بالمسجد الحرام ١٤٤٧',
  mushafEn: 'Taraweeh and Tahajjud at the Grand Mosque, 1447',
  source: 'archive.org item Mecca1447, via the mushaf-audio Worker',
  note: 'تلاوات لأئمة متعددين — لم تُنسب كل سورة إلى قارئها بعد.',
  // No one face fits a compilation, and none has been chosen. The medallion
  // falls back to its tile colour rather than showing someone who did not
  // recite most of this.
  photo: null,
  released: 114,
  total: 114,
  surahs: Array.from({ length: 114 }, (_, i) => i + 1).map((surah) => ({
    surah,
    url: `${WORKER}/h/${surah}.mp3`,
    fallbackUrl: null,
    bytes: results.get(surah),
    /**
     * Nothing here is asserted, because nothing can be.
     *
     * Seven imams led that Ramadan and no source records which surah is
     * whose — not the archive item, not its files' tags, not the collection
     * listing on tilawatalharamain. Without that map the seconds-per-letter
     * check has to take one median across seven different paces, which would
     * delete legitimate recordings rather than find wrong ones. So the check
     * is not run and every surah asks for an ear check instead, which the
     * VerifyPanel already handles — and effectiveVerified() lets a listener
     * settle one for good.
     */
    verified: false,
  })),
}

catalog.reciters = [...catalog.reciters.filter((r) => r.id !== entry.id), entry]
writeFileSync('data/catalog.json', JSON.stringify(catalog, null, 1))

console.log('\nCatalog now carries:')
for (const r of catalog.reciters) {
  const gb = r.surahs.reduce((a, s) => a + s.bytes, 0) / 1073741824
  console.log(
    `  ${r.id.padEnd(16)} ${String(r.surahs.length).padStart(3)}/114  ${gb.toFixed(2)} GB  ${r.mushaf}`,
  )
}
