/**
 * Refreshes data/catalog.json from the audio proxy.
 *
 * Al-Dosari's mushaf is still being recorded — the Saudi Center airs episodes
 * nightly — so the surah list grows over time. This asks the Worker how many
 * are published, sizes each one through the same path the app uses, and
 * rewrites the catalog. Run weekly by .github/workflows/refresh.yml.
 *
 *   node scripts/refresh-catalog.mjs           # refresh everything
 *   node scripts/refresh-catalog.mjs dosari    # one reciter
 *
 * Exits 0 with no changes when nothing new has aired, so the job can decide
 * whether there is anything to commit.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const WORKER = process.env.WORKER_URL ?? 'https://mushaf-audio.mushaftarteel.workers.dev'
const CONCURRENCY = 4
const only = process.argv[2] ?? null

const meta = JSON.parse(readFileSync('data/surahs.json', 'utf8'))
const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'))

const SOURCES = {
  dosari: {
    route: 'd',
    countPath: '/count/d',
    name: 'ياسر الدوسري',
    nameEn: 'Yasser Al-Dosari',
    fullName: 'أ. د. ياسر بن راشد الدوسري',
    mushaf: 'إنتاج المركز السعودي للتلاوات القرآنية',
    photo: 'sheikh.jpg',
    note: 'ما زال قيد التسجيل — تُضاف السور الجديدة تلقائيًا.',
  },
  'burhaji-nabawi': {
    route: 'b',
    countPath: null, // complete; no need to ask
    fixedCount: 114,
    name: 'محمد برهجي',
    nameEn: 'Muhammad Burhaji',
    fullName: 'أ. د. محمد برهجي',
    mushaf: 'المصحف المرتل من مسجد رسول الله ﷺ',
    mushafEn: "The Prophet's Mosque",
    photo: 'burhaji.jpg',
  },
}

async function publishedCount(src) {
  if (src.fixedCount) return src.fixedCount
  const res = await fetch(`${WORKER}${src.countPath}`, {
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`count endpoint returned ${res.status}`)
  const { published } = await res.json()
  if (!published) throw new Error('count endpoint reported nothing published')
  return published
}

async function sizeOf(route, surah) {
  const res = await fetch(`${WORKER}/${route}/${surah}.mp3`, {
    headers: { Range: 'bytes=0-1' },
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)
  const cr = res.headers.get('content-range')
  const total = cr ? Number(/\/(\d+)\s*$/.exec(cr)?.[1]) : 0
  if (!total) throw new Error('no Content-Range')
  await res.arrayBuffer().catch(() => {})
  return total
}

async function refresh(id) {
  const src = SOURCES[id]
  if (!src) throw new Error(`unknown reciter: ${id}`)

  const count = await publishedCount(src)
  const had = catalog.reciters.find((r) => r.id === id)?.surahs.length ?? 0
  console.log(`${id}: ${count} published (catalog has ${had})`)

  const results = new Map()
  const failures = []
  const queue = Array.from({ length: count }, (_, i) => i + 1)

  async function run() {
    for (;;) {
      const surah = queue.shift()
      if (surah === undefined) return
      // Every surah is measured, never carried over. The catalog URL is
      // always `${WORKER}/${route}/${surah}.mp3`, so a "has the URL changed"
      // check can never fire — reusing sizes silently kept five surahs in the
      // catalog whose audio had been 404ing since they moved to the proxy.
      // Measuring is the only thing that proves a surah is actually reachable.
      try {
        results.set(surah, await sizeOf(src.route, surah))
      } catch (e) {
        failures.push({ surah, error: e.message })
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, run))

  if (failures.length) {
    console.error(`  ${failures.length} failed:`)
    for (const f of failures.slice(0, 8)) console.error(`    ${f.surah}: ${f.error}`)
    throw new Error(`${id}: refusing to write a catalog with holes`)
  }

  const entry = {
    id,
    name: src.name,
    nameEn: src.nameEn,
    fullName: src.fullName,
    mushaf: src.mushaf,
    ...(src.mushafEn ? { mushafEn: src.mushafEn } : {}),
    ...(src.note ? { note: src.note } : {}),
    source: `${WORKER}/${src.route}/{surah}.mp3`,
    photo: src.photo,
    released: count,
    total: 114,
    surahs: Array.from({ length: count }, (_, i) => {
      const surah = i + 1
      return {
        surah,
        name: meta[i].name,
        url: `${WORKER}/${src.route}/${surah}.mp3`,
        fallbackUrl: null,
        bytes: results.get(surah),
        // Files are resolved from each surah's own page, so the name-to-audio
        // association comes from the source rather than from a filename guess.
        verified: true,
      }
    }),
  }

  const idx = catalog.reciters.findIndex((r) => r.id === id)
  if (idx >= 0) catalog.reciters[idx] = entry
  else catalog.reciters.push(entry)

  return count - had
}

const targets = only ? [only] : Object.keys(SOURCES)
let added = 0
for (const id of targets) added += await refresh(id)

writeFileSync('data/catalog.json', JSON.stringify(catalog, null, 1))

console.log('')
for (const r of catalog.reciters) {
  const gb = r.surahs.reduce((a, s) => a + s.bytes, 0) / 1073741824
  console.log(
    `  ${r.id.padEnd(16)} ${String(r.surahs.length).padStart(3)}/114  ${gb.toFixed(2)} GB`,
  )
}
console.log(added > 0 ? `\n${added} new surah(s).` : '\nNo new surahs.')
