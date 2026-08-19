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

const text = JSON.parse(readFileSync('data/quran-text.json', 'utf8'))

const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }

/** Letters of Quranic text in a surah — the best cheap proxy for how long it
 *  takes to recite, and far better than ayah count. */
const lettersIn = (surah) =>
  (text[String(surah)] || []).join(' ').replace(/[^ء-ي]/g, '').length

/**
 * Duration of an MP3, or null when it cannot be read confidently.
 *
 * Returning null matters more than returning a number: several sources serve
 * .m4a, which this cannot parse at all, and a garbage duration fed to the
 * plausibility check silently drops perfectly good surahs from the catalog.
 * Only a real MPEG frame header counts as a measurement.
 */
function durationOf(buf, total) {
  if (buf.length < 12) return null
  // ISO base media (.m4a/.mp4) begins with a size field then 'ftyp'. Its
  // payload contains byte pairs that look like MPEG sync, so scanning it as
  // MP3 yields a confident, wrong answer — one .m4a measured 8.58x its true
  // length and was nearly dropped from the catalog as corrupt.
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') return null
  let off = 0
  if (buf.slice(0, 3).toString('latin1') === 'ID3') {
    off = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f))
  }
  while (off < buf.length - 4 && !(buf[off] === 0xff && (buf[off + 1] & 0xe0) === 0xe0)) off++
  if (off >= buf.length - 4) return null
  const h1 = buf[off + 1], h2 = buf[off + 2], h3 = buf[off + 3]
  const ver = (h1 >> 3) & 3
  const layer = (h1 >> 1) & 3
  const brIdx = (h2 >> 4) & 0xf
  const srIdx = (h2 >> 2) & 3
  // Reserved version, non-Layer-III, free/bad bitrate or reserved sample rate
  // all mean this is not an MP3 frame we can trust.
  if (ver === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) return null
  const br = (ver === 3 ? BR1 : BR2)[brIdx] * 1000
  const sr = (SR[ver] || SR[3])[srIdx]
  const chan = (h3 >> 6) & 3
  const x = off + 4 + (ver === 3 ? (chan === 3 ? 17 : 32) : (chan === 3 ? 9 : 17))
  const tag = buf.slice(x, x + 4).toString('latin1')
  if (tag === 'Xing' || tag === 'Info') {
    const flags = buf.readUInt32BE(x + 4)
    if (flags & 1) return buf.readUInt32BE(x + 8) * (ver === 3 ? 1152 : 576) / sr
  }
  return br ? ((total - off) * 8) / br : 0
}

const WORKER = process.env.WORKER_URL ?? 'https://mushaf-audio.mushaftarteel.workers.dev'
const CONCURRENCY = 4
const only = process.argv[2] ?? null

const meta = JSON.parse(readFileSync('data/surahs.json', 'utf8'))
const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'))

const SOURCES = {
  dosari: {
    route: 'd',
    countPath: '/count/d?fresh=1',
    name: 'ياسر الدوسري',
    nameEn: 'Yasser Al-Dosari',
    fullName: 'أ. د. ياسر بن راشد الدوسري',
    mushaf: 'إنتاج المركز السعودي للتلاوات القرآنية',
    photo: 'sheikh.jpg',
    note: 'ما زال قيد التسجيل — تُضاف السور الجديدة تلقائيًا.',
  },
  turki: {
    route: 't',
    countPath: '/count/t?fresh=1',
    name: 'بدر التركي',
    nameEn: 'Badr Al-Turki',
    fullName: 'الشيخ بدر التركي',
    mushaf: 'إنتاج المركز السعودي للتلاوات القرآنية',
    photo: null,
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
    note: 'أربع سور غير متاحة: ملفاتها لدى المصدر تحتوي تلاوة سورة أخرى.',
  },
}

async function publishedCount(src) {
  if (src.fixedCount) return src.fixedCount
  // Always ask past the Worker's index cache. A stale count would make the
  // job conclude "nothing new" and skip surahs that have already aired.
  const res = await fetch(`${WORKER}${src.countPath}`, {
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`count endpoint returned ${res.status}`)
  const { published } = await res.json()
  if (!published) throw new Error('count endpoint reported nothing published')
  return published
}

/**
 * Measures a surah and checks the audio is plausibly that surah.
 *
 * midad's files for four Burhaji surahs hold the wrong recitation — their
 * pages are labelled correctly, so nothing upstream reveals it. Only the
 * audio itself does: a surah whose length is wildly out of step with its text
 * is not that surah, and serving it would play the wrong recitation with no
 * warning. Reads the first 128 KB, which is enough for the frame header.
 */
async function measure(route, surah) {
  const res = await fetch(`${WORKER}/${route}/${surah}.mp3`, {
    headers: { Range: 'bytes=0-131071' },
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)
  const cr = res.headers.get('content-range')
  const total = cr ? Number(/\/(\d+)\s*$/.exec(cr)?.[1]) : 0
  if (!total) throw new Error('no Content-Range')
  const buf = Buffer.from(await res.arrayBuffer())
  return { bytes: total, seconds: durationOf(buf, total) }
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
        results.set(surah, await measure(src.route, surah))
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

  // Seconds per letter should be roughly constant across a mushaf. Where it
  // is not, the file does not contain the surah it claims to.
  // Short surahs are dominated by the basmalah and pauses — Al-Fatiha runs
  // 1.35x its text length quite legitimately — so they are not judged.
  const MIN_LETTERS = 150
  const measured = [...results.entries()].filter(([, m]) => m.seconds != null)
  const rates = measured
    .filter(([surah]) => lettersIn(surah) >= MIN_LETTERS)
    .map(([surah, m]) => m.seconds / lettersIn(surah))
    .filter((r) => Number.isFinite(r) && r > 0)
    .sort((a, b) => a - b)

  const mismatched = []
  // Needs enough readable files for a median to mean anything.
  if (rates.length >= 30) {
    const median = rates[Math.floor(rates.length / 2)]
    for (const [surah, m] of measured) {
      const letters = lettersIn(surah)
      if (letters < MIN_LETTERS) continue
      const factor = m.seconds / letters / median
      if (factor > 1.45 || factor < 0.69) mismatched.push({ surah, factor })
    }
  }
  const unreadable = results.size - measured.length
  console.log(
    `  measured ${measured.length}/${results.size}` +
      (unreadable ? ` (${unreadable} not MP3, length not checked)` : ''),
  )
  for (const x of mismatched) {
    console.warn(
      `  ! surah ${x.surah}: audio length is ${x.factor.toFixed(2)}x what the text implies — excluded`,
    )
    results.delete(x.surah)
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
    surahs: Array.from({ length: count }, (_, i) => i + 1)
      .filter((surah) => results.has(surah))
      .map((surah) => {
        return {
        surah,
        name: meta[surah - 1].name,
        url: `${WORKER}/${src.route}/${surah}.mp3`,
        fallbackUrl: null,
        bytes: results.get(surah).bytes,
        // Files are resolved from each surah's own page, so the name-to-audio
        // association comes from the source rather than from a filename guess.
        verified: true,
      }
    }),
  }
  entry.released = entry.surahs.length

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
