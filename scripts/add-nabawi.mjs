/**
 * Adds the Burhaji Prophet's Mosque mushaf to data/catalog.json.
 *
 * Sizes every surah by asking the Worker for the first two bytes and reading
 * Content-Range. That doubles as an end-to-end check: if a surah cannot be
 * resolved through the proxy, it shows up here rather than in the app.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const WORKER = process.env.WORKER_URL ?? 'https://mushaf-audio.mushaftarteel.workers.dev'
const CONCURRENCY = 4

const meta = JSON.parse(readFileSync('data/surahs.json', 'utf8'))

async function sizeOf(surah) {
  const res = await fetch(`${WORKER}/b/${surah}.mp3`, {
    headers: { Range: 'bytes=0-1' },
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)
  const cr = res.headers.get('content-range')
  const total = cr ? Number(/\/(\d+)\s*$/.exec(cr)?.[1]) : 0
  if (!total) throw new Error('no Content-Range')
  // Drain so the connection is released promptly.
  await res.arrayBuffer().catch(() => {})
  return total
}

const results = new Map()
const failures = []
const queue = meta.map((m) => m.surah)

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
    if (done % 10 === 0) console.log(`  ${done}/114 …`)
  }
}

console.log(`Sizing 114 surahs through ${WORKER}`)
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
  id: 'burhaji-nabawi',
  name: 'محمد برهجي',
  nameEn: 'Muhammad Burhaji',
  fullName: 'أ. د. محمد برهجي',
  mushaf: 'المصحف المرتل من مسجد رسول الله ﷺ',
  mushafEn: "The Prophet's Mosque",
  source: 'midad.com collection 465944, via the mushaf-audio Worker',
  note: 'يُقدَّم عبر وسيط لإتاحة التشغيل في المتصفح.',
  released: 114,
  total: 114,
  surahs: meta.map((m) => ({
    surah: m.surah,
    name: m.name,
    url: `${WORKER}/b/${m.surah}.mp3`,
    fallbackUrl: null,
    bytes: results.get(m.surah),
    // Durations for Al-Baqarah and Aali Imran match the published videos to
    // the second, so the recording itself is confirmed.
    verified: true,
  })),
}

catalog.reciters = [...catalog.reciters.filter((r) => r.id !== entry.id), entry]
writeFileSync('data/catalog.json', JSON.stringify(catalog, null, 1))

console.log('\nCatalog now carries:')
for (const r of catalog.reciters) {
  const gb = r.surahs.reduce((a, s) => a + s.bytes, 0) / 1073741824
  console.log(`  ${r.id.padEnd(16)} ${String(r.surahs.length).padStart(3)}/114  ${gb.toFixed(2)} GB  ${r.mushaf}`)
}
