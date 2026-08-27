/**
 * Builds verse timings for the reciters whose audio *is* a published recording.
 *
 * A timing file belongs to a recording, not to a reciter. Two takes by the same
 * sheikh are two different files, and published timings laid over the wrong one
 * point confidently at the wrong word — surah 114 runs 52 s in our As-Sudais and
 * 26 s in the one quran.com timed. So nothing here is matched by name. Every
 * surah of every reciter is matched by measuring both audio files and requiring
 * them to be the same length to a fortieth of a second.
 *
 * That threshold is not arbitrary. Where the recording genuinely is the same
 * file, the measured difference is 0.00 s on all 114 surahs, every time — it is
 * the same master, sometimes re-tagged, and re-tagging does not move audio. A
 * different take by the same reciter at the same pace lands within a second on
 * short surahs and drifts by minutes on long ones. Anything in between is two
 * recordings, not one, and is rejected.
 *
 * Usage:
 *   node scripts/build-matched-timings.mjs            # verify, then write
 *   node scripts/build-matched-timings.mjs --verify   # report only, write nothing
 *   node scripts/build-matched-timings.mjs budair     # one reciter
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'data')

/**
 * Our reciters and the published recording each one turned out to be.
 *
 * Short, and it stays short. A sweep of all 119 QUL recitations and all 14 on
 * quran.com — every recitation that publishes timings anywhere — found exactly
 * these two beyond the shipped Burhaji word timings. See the header of
 * REJECTED below for who was tested and turned down.
 */
const MATCHES = {
  budair: { qul: 43, who: 'Salah al-Budair' },
  'juhany-hafs': { qul: 162, who: 'Abdullah Awad al-Juhani' },
}

/**
 * The candidates that came closest, and why each one is not a match.
 *
 * Recorded so the next person does not spend a day re-testing them. Every one
 * of these is the same sheikh or a near-identical pace, which is exactly the
 * trap: on the five short surahs everyone samples, several agree to within two
 * seconds. They fall apart on Al-Baqarah, which is why the sweep that produced
 * this list measured long surahs too. Numbers are our audio length minus the
 * published recording's, in seconds.
 */
export const REJECTED = {
  jaber: {
    qul: 158,
    why:
      'the same sheikh, a different mushaf. 73 of 114 surahs differ by more ' +
      'than a second and Al-Baqarah by 1608.74 s: ours runs 6227.98 s, QUL 7836.73 s. ' +
      'The 41 that do land within a second are spread across ±0.97 s rather than ' +
      'sitting at 0.00 as a re-tag of one master does, so they are two close ' +
      'performances rather than one recording.',
  },
  turki: {
    qul: 177,
    why:
      'the plainest illustration of why names are worthless here. QUL 177 is ' +
      'also called Badr Al-Turki and also carries word segments, and it agrees ' +
      'with our audio on none of the 114 surahs: Al-Kahf alone is 1958.65 s ' +
      'ours against 1699.42 s. Two mushafs by one sheikh.',
  },
  dosari: { qul: 88, why: 'Mostafa Ismaeel; within 1.83 s short, -735.13 s on Al-Kahf' },
  'turki-alt': { qul: 129, why: 'Mahmood Ali Al-Bana; within 1.86 s short, -269.57 s on Al-Baqarah' },
  juhany: { qul: 122, why: 'Al-Husary; within 0.89 s short, +1220.13 s on Al-Baqarah' },
  minshawi: { qul: 160, why: 'Bandar Baleela; within 1.57 s short, +1693.61 s on Al-Baqarah' },
  ayyub: { qul: 14, why: 'Fares Abbad; within 1.60 s short, -563.28 s on Al-Baqarah' },
  baleela: { qul: 160, why: 'the timed Baleela is another take; -313.92 s on Al-Baqarah' },
  ghilan: { qul: 177, why: 'Badr Al-Turki, not Ghilan; +259.23 s on Al-Kahf' },
  luhaidan: { qul: 169, why: 'Muhammad Jibreel; -966.87 s on Al-Baqarah' },
  buayjan: { qul: 169, why: 'Muhammad Jibreel; +4.06 s on Al-Kawthar, and our audio is AAC' },
}

/**
 * Every Makkah and Madinah Taraweeh compilation is absent, and not for want of
 * looking. QUL lists 25 recitations with "Taraweeh" in the name, among them
 * Makkah 1434 and 1437-1442 and Madinah 1423-1442. All 25 were queried across
 * twelve surahs spread through the mushaf and every one returned zero segments,
 * verse or word. quran.com's fourteen reciters include no Taraweeh at all, and
 * our own compilations run to 1447, past the last year anyone has published.
 * The only route for these is forced alignment - see scripts/align.
 */

/** Same file, allowing only for a re-tag: MP3 frames are ~26 ms, so a quarter
 *  second is already many frames of slack. Genuine matches measure 0.00. */
const SAME_FILE_S = 0.25

const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }

async function range(url, from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { headers: { Range: `bytes=${from}-${to}` } })
      if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      const cr = r.headers.get('content-range')
      const total = cr ? Number(cr.split('/')[1]) : Number(r.headers.get('content-length') || 0)
      return { buf, total }
    } catch (e) {
      if (attempt === 2) throw e
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
  }
}

/**
 * The length of a remote MP3, from two ranged reads rather than a download.
 *
 * The second read starts where the ID3v2 tag ends, which matters more than it
 * sounds: quranicaudio ships 420 KB of cover art in front of the audio on some
 * recitations, so a fixed read from byte zero never reaches a frame header and
 * the file looks unreadable. That blind spot is what hid the Ali Jaber
 * mismatch — the probe returned null and the surah was quietly assumed to match.
 */
export async function probe(url) {
  const head = await range(url, 0, 9)
  let off = 0
  if (head.buf.slice(0, 3).toString('latin1') === 'ID3') {
    const b = head.buf
    off = 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f))
  }
  const win = await range(url, off, off + 65535)
  const buf = win.buf
  const total = head.total || win.total
  let i = 0
  while (i < buf.length - 4 && !(buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0)) i++
  if (i >= buf.length - 4) return { seconds: null, bytes: total }
  const h1 = buf[i + 1],
    h2 = buf[i + 2],
    h3 = buf[i + 3]
  const ver = (h1 >> 3) & 3
  const layer = (h1 >> 1) & 3
  const brIdx = (h2 >> 4) & 0xf
  const srIdx = (h2 >> 2) & 3
  if (ver === 1 || layer !== 1 || !brIdx || brIdx === 15 || srIdx === 3)
    return { seconds: null, bytes: total }
  const br = (ver === 3 ? BR1 : BR2)[brIdx] * 1000
  const sr = (SR[ver] || SR[3])[srIdx]
  const chan = (h3 >> 6) & 3
  const x = i + 4 + (ver === 3 ? (chan === 3 ? 17 : 32) : chan === 3 ? 9 : 17)
  const tag = buf.slice(x, x + 4).toString('latin1')
  // A Xing frame count is a measurement; a bitrate estimate is a division. Take
  // the measurement when the encoder left one.
  if ((tag === 'Xing' || tag === 'Info') && buf.readUInt32BE(x + 4) & 1)
    return {
      seconds: (buf.readUInt32BE(x + 8) * (ver === 3 ? 1152 : 576)) / sr,
      exact: true,
      bytes: total,
    }
  return { seconds: ((total - off) * 8) / br, exact: false, bytes: total }
}

const qulSegments = async (id, chapter) => {
  for (let attempt = 0; ; attempt++) {
    try {
      // per_page is mandatory: the default page size is 10 and truncates in
      // silence, which would ship Al-Baqarah with ten timed verses out of 286.
      const r = await fetch(
        `https://qul.tarteel.ai/api/v1/audio/surah_segments/${id}?chapter=${chapter}&per_page=300`,
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.json()
    } catch (e) {
      if (attempt === 2) throw e
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
  }
}

async function pooled(items, size, fn) {
  const q = [...items]
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (q.length) await fn(q.shift())
    }),
  )
}

/**
 * One surah, checked end to end, and the reason if it cannot be shipped.
 *
 * Four things have to hold. The two audio files must be the same length. The
 * segment set must cover every verse of the surah, because a surah timed to
 * verse 30 of 45 leaves the highlight frozen for the last third. It must not
 * run past the end of the audio — QUL's An-Nisa for Al-Juhani ends 307 s after
 * the file does, which is 18 verses that can never be reached. And the starts
 * must be sorted, which they nearly always are.
 */
function judge({ ours, theirs, segs, verses, expected }) {
  if (ours == null) return 'our audio could not be measured'
  if (theirs == null) return "the published recording could not be measured"
  const drift = ours - theirs
  if (Math.abs(drift) > SAME_FILE_S)
    return `different recording: ours ${ours.toFixed(2)} s, published ${theirs.toFixed(2)} s (${drift >= 0 ? '+' : ''}${drift.toFixed(2)} s)`
  if (!verses) return 'no published segments'
  if (expected && verses !== expected) return `${verses} verses timed of ${expected}`
  const last = segs[segs.length - 1][1].at(-1) / 1000
  if (last - ours > 0.5)
    return `timings overrun the audio by ${(last - ours).toFixed(2)} s`
  return null
}

async function build(ourId, { qul, who }, catalog, surahMeta, verifyOnly) {
  const reciter = catalog.reciters.find((r) => r.id === ourId)
  if (!reciter) throw new Error(`no reciter "${ourId}" in data/catalog.json`)

  const results = {}
  await pooled(
    surahMeta.map((s) => s.surah),
    8,
    async (ch) => {
      const mine = reciter.surahs.find((s) => s.surah === ch)
      if (!mine) return void (results[ch] = { skip: 'we do not carry this surah' })
      try {
        const doc = await qulSegments(qul, ch)
        const [ours, theirs] = await Promise.all([
          probe(mine.url).then((p) => p.seconds),
          doc.audio?.url ? probe(doc.audio.url).then((p) => p.seconds) : null,
        ])
        const raw = doc.segments || {}
        // [ayah, [start ms]] — a verse-timed surah is a word-timed one whose
        // starts hold a single number, which is the shape data.ts reads.
        const segs = Object.keys(raw)
          .map((k) => Number(k.split(':')[1]))
          .sort((a, b) => a - b)
          .map((ayah) => {
            const v = raw[`${ch}:${ayah}`]
            const words = (v.segments || []).map((s) => s[1]).filter((n) => Number.isFinite(n))
            return [ayah, words.length ? [...new Set(words)].sort((a, b) => a - b) : [v.time_from]]
          })
        // QUL's As-Saffat for Al-Budair has verse 89 starting 79 ms before
        // verse 88 — a data-entry artefact, not a recitation that goes
        // backwards. Held to non-decreasing so anything that steps by verse
        // cannot step backwards; a real disagreement would be seconds, and
        // shows up as a rejected surah rather than as a clamp.
        for (let i = 1; i < segs.length; i++)
          if (segs[i][1][0] < segs[i - 1][1][0]) segs[i][1][0] = segs[i - 1][1][0]
        const expected = surahMeta.find((s) => s.surah === ch)?.ayahs
        results[ch] = {
          ours,
          theirs,
          segs,
          words: segs.some(([, s]) => s.length > 1),
          skip: judge({ ours, theirs, segs, verses: segs.length, expected }),
        }
      } catch (e) {
        results[ch] = { skip: `probe failed: ${e.message}` }
      }
    },
  )

  const kept = surahMeta.map((s) => s.surah).filter((ch) => !results[ch].skip)
  const dropped = surahMeta.map((s) => s.surah).filter((ch) => results[ch].skip)
  const wordLevel = kept.length > 0 && kept.every((ch) => results[ch].words)

  console.log(`\n${ourId}  <-  QUL ${qul} (${who})`)
  console.log(`  ${kept.length} surahs verified, ${dropped.length} dropped`)
  for (const ch of dropped) console.log(`    surah ${String(ch).padStart(3)}: ${results[ch].skip}`)

  if (verifyOnly || !kept.length) return
  const worst = Math.max(...kept.map((ch) => Math.abs(results[ch].ours - results[ch].theirs)))
  const out = {
    unit: 'ms',
    source:
      `Quranic Universal Library, recitation ${qul} (${who}) — verified per surah by ` +
      `measuring both audio files: across the ${kept.length} surahs kept, our copy and ` +
      `QUL's differ in length by at most ${worst.toFixed(2)} s. ` +
      (dropped.length
        ? `${dropped.length} surah${dropped.length > 1 ? 's' : ''} (${dropped.join(', ')}) ` +
          `${dropped.length > 1 ? 'are' : 'is'} deliberately absent — see scripts/build-matched-timings.mjs.`
        : 'All 114 surahs matched.'),
    granularity: wordLevel ? 'word' : 'ayah',
    surahs: Object.fromEntries(kept.map((ch) => [String(ch), results[ch].segs])),
  }
  const file = path.join(DATA, `timings-${ourId}.json`)
  fs.writeFileSync(file, JSON.stringify(out))
  console.log(`  wrote ${path.relative(ROOT, file)} (${out.granularity}, ${kept.length} surahs)`)
}

/**
 * Check any pairing, including one not in MATCHES.
 *
 * The same code path that writes a file, with the writing switched off, so a
 * claim can be re-tested later without trusting the note that recorded it:
 *   node -e "import('./scripts/build-matched-timings.mjs')
 *     .then(m => m.verify('jaber', 158))"
 */
export async function verify(ourId, qulId, who = `QUL ${qulId}`) {
  const catalog = JSON.parse(fs.readFileSync(path.join(DATA, 'catalog.json'), 'utf8'))
  const surahMeta = JSON.parse(fs.readFileSync(path.join(DATA, 'surahs.json'), 'utf8'))
  return build(ourId, { qul: qulId, who }, catalog, surahMeta, true)
}

// Importable as a module: only a direct run builds anything.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2)
  const verifyOnly = argv.includes('--verify')
  const only = argv.filter((a) => !a.startsWith('--'))
  const catalog = JSON.parse(fs.readFileSync(path.join(DATA, 'catalog.json'), 'utf8'))
  const surahMeta = JSON.parse(fs.readFileSync(path.join(DATA, 'surahs.json'), 'utf8'))

  for (const [id, m] of Object.entries(MATCHES)) {
    if (only.length && !only.includes(id)) continue
    await build(id, m, catalog, surahMeta, verifyOnly)
  }
}
