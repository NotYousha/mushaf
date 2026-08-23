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
const CONCURRENCY = Number(process.env.REFRESH_CONCURRENCY ?? 4)
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
    photo: 'turki.webp',
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
    photo: 'burhaji.webp',
    /**
     * The source's files in the 94-102 range hold each other's recitations.
     * Comparing our exact durations against the QUA reference timings for
     * this same recording identifies which file holds which surah, so most
     * are recoverable by pointing the surah at the file that actually
     * contains it rather than the one named after it.
     *
     * `surah: file`, verified by duration to within 1%.
     */
    remap: { 94: 96, 95: 97, 96: 98, 98: 100, 99: 94, 100: 101, 101: 102, 102: 95 },
    /**
     * Az-Zalzala and Al-Qaari'a run 51.4s and 51.2s here — two tenths of a
     * second apart, against trailing silence that varies by more than a
     * second. No measurement separates them, so these were identified by
     * listening, as was 100 when Al-Qaari'a was heard playing Al-Aadiyaat.
     */
    earConfirmed: [99, 100, 101, 97],
    /**
     * Al-Qadr is not in the source collection at all — the one unplaced file
     * matches surahs already being served better than it matches Al-Qadr. It
     * is supplied instead from a copy of the same recording, hosted with the
     * app. Measured at 36.70s against the reference 36.94s, at the same
     * 128 kbps as the rest of this mushaf.
     */
    localFiles: { 97: 'audio/burhaji-097.mp3' },
    exclude: [],
  },
  /**
   * The only reciter here who is not reading Hafs.
   *
   * Ad-Duri from Abu Amr al-Basri is a different riwayah, so the wording
   * itself differs from the Hafs text the rest of the app is built on. The
   * riwayah is therefore carried on the reciter and shown wherever the name
   * is, and the mushaf page refuses to display Hafs text under it.
   */
  juhany: {
    route: 'j',
    countPath: '/count/j?fresh=1',
    name: 'عبد الله الجهني',
    nameEn: 'Abdullah Al-Juhany',
    fullName: 'الشيخ عبد الله بن علي الجهني',
    riwayah: 'رواية الدوري عن أبي عمرو البصري',
    riwayahEn: 'Ad-Duri from Abu Amr al-Basri',
    // Its audio is spread over top4top subdomains, several of which are
    // currently down. Ship what plays; the weekly job collects the rest.
    partialOk: true,
    mushaf: 'مصحف برواية الدوري عن أبي عمرو البصري',
    mushafEn: 'Mushaf in the riwayah of Ad-Duri',
    photo: 'juhany.webp',
    exclude: [],
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
 * One range request, retried when the far end simply does not answer.
 *
 * Al-Juhany's files sit on a host that drops connections under any real
 * concurrency — a first pass over 114 surahs saw a third of them come back
 * 522 from the proxy. Those are not missing recordings and must not be
 * treated as holes in the catalog, so a few patient retries stand between a
 * flaky host and a wrong conclusion.
 */
async function fetchWithRetry(url, attempts = Number(process.env.REFRESH_ATTEMPTS ?? 4)) {
  let last = null
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { Range: 'bytes=0-131071' },
        signal: AbortSignal.timeout(120_000),
      })
      // 5xx from the proxy means it could not reach the origin, which is
      // worth another go; a 4xx is a real answer and is not retried.
      if (res.status < 500) return res
      last = new Error(`HTTP ${res.status}`)
    } catch (e) {
      last = e
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, Math.min(30_000, 2000 * 2 ** i)))
  }
  throw last ?? new Error('unreachable')
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
  const res = await fetchWithRetry(`${WORKER}/${route}/${surah}.mp3`)
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
      // A locally hosted file is measured from disk, not over the network.
      if (src.localFiles?.[surah]) {
        const buf = readFileSync(`public/${src.localFiles[surah]}`)
        results.set(surah, { bytes: buf.length, seconds: durationOf(buf, buf.length) })
        continue
      }
      try {
        results.set(surah, await measure(src.route, src.remap?.[surah] ?? surah))
      } catch (e) {
        failures.push({ surah, error: e.message })
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, run))

  if (failures.length) {
    console.error(`  ${failures.length} failed:`)
    for (const f of failures.slice(0, 12)) console.error(`    ${f.surah}: ${f.error}`)

    /**
     * A source may simply not have every surah available.
     *
     * Al-Juhany's files are spread across a dozen top4top subdomains and
     * several of those are down — the same surahs fail every time, at the
     * connect timeout, while their neighbours answer in a second. Refusing
     * the whole mushaf over that would ship nothing rather than the 83 surahs
     * that do play, and the weekly refresh picks up the rest whenever those
     * hosts return.
     *
     * This stays opt-in per source, because for every other reciter a failed
     * measurement means something is wrong with our end and a hole would hide
     * it. A source that opts in must still deliver most of what it claims.
     */
    if (!src.partialOk) throw new Error(`${id}: refusing to write a catalog with holes`)
    const got = count - failures.length
    if (got < count * 0.5) {
      throw new Error(
        `${id}: only ${got} of ${count} surahs are reachable — too few to publish`,
      )
    }
    console.error(
      `  ${id}: publishing ${got} of ${count}; the rest are unreachable at the source`,
    )
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
  for (const surah of Object.keys(src.remap ?? {}).map(Number)) {
    console.log(`  remapped surah ${surah} -> file ${src.remap[surah]}`)
  }

  for (const surah of src.exclude ?? []) {
    if (results.delete(surah)) {
      console.warn(`  ! surah ${surah}: excluded — source files in this range are shuffled`)
    }
  }

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
    // Absent means Hafs, which is what everything else assumes.
    ...(src.riwayah ? { riwayah: src.riwayah, riwayahEn: src.riwayahEn } : {}),
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
        // A locally hosted file wins; otherwise a remapped surah is fetched
        // from the file that actually holds it.
        url: src.localFiles?.[surah]
          ? src.localFiles[surah]
          : `${WORKER}/${src.route}/${src.remap?.[surah] ?? surah}.mp3`,
        fallbackUrl: null,
        bytes: results.get(surah).bytes,
        // Files are resolved from each surah's own page, so the name-to-audio
        // association comes from the source rather than from a filename guess.
        // A remapped one is identified by duration, so it asks for an ear check.
        verified: !src.remap?.[surah] || !!src.earConfirmed?.includes(surah),
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
