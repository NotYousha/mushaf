/**
 * Builds data/timings-<id>.json at verse granularity, from QUL.
 *
 * Word timings barely exist. Verse timings mostly do, and the reason to take
 * them is that the mushaf can still follow the recitation with them — it
 * shades the ayah being recited instead of boxing the word, which is what the
 * reference apps fall back to as well.
 *
 * The hard part is not the fetching. It is that **timings belong to a
 * recording, not to a reciter.** Nearly every published set was made against
 * the QuranicAudio takes, and most of our audio is the Saudi Center's or a
 * recent archive.org upload of a different mushaf by the same sheikh. Surah
 * 114 runs 52 seconds in our As-Sudais and 26 in the one quran.com timed:
 * same man, different recording, and the timings are worse than none because
 * they would confidently point at the wrong word.
 *
 * So each reciter here has had its audio checked against the source the
 * timings came from, and the note on each says how. A reciter whose audio was
 * not proven to match is not in this list, however good the data looks.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'

const CACHE = '.cache/qul'
mkdirSync(CACHE, { recursive: true })

/**
 * Our reciters whose audio is provably the recording QUL timed.
 *
 * `qul` is the recitation id on qul.tarteel.ai.
 */
const RECITERS = [
  {
    id: 'juhany-hafs',
    qul: 162,
    match:
      'md5-identical: our 114.mp3 and QUL’s are the same file, ' +
      '1ea7d712c296f53bd9df824e6fcd3274',
  },
  {
    id: 'budair',
    qul: 43,
    match:
      'frame-identical: surah 36 is 658.47 s / 25,207 frames / 192 kbps in ' +
      'both copies; the files differ by 612 bytes of ID3 tag',
  },
  {
    id: 'jaber',
    qul: 158,
    match:
      'duration agrees to within a second: across surahs 94, 103, 108, 110 ' +
      'and 112 our file length and QUL’s last verse end differ by ' +
      '−0.76 to +0.45 s',
  },
]

const AYAHS = JSON.parse(readFileSync('data/surahs.json', 'utf8')).map((s) => s.ayahs)

async function chapter(qul, n) {
  const f = `${CACHE}/${qul}-${n}.json`
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'))
  // per_page is not optional: the default page size is ten and a surah longer
  // than that is silently truncated rather than paginated into an error.
  const url = `https://qul.tarteel.ai/api/v1/audio/surah_segments/${qul}?chapter=${n}&per_page=300`
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`${qul}/${n}: HTTP ${res.status}`)
  const json = await res.json()
  writeFileSync(f, JSON.stringify(json))
  return json
}

for (const r of RECITERS) {
  console.log(r.id)
  const surahs = {}
  let ayahs = 0

  for (let n = 1; n <= 114; n++) {
    const { segments } = await chapter(r.qul, n)
    const verses = []
    for (let a = 1; a <= AYAHS[n - 1]; a++) {
      const seg = segments?.[`${n}:${a}`]
      if (!seg || typeof seg.time_from !== 'number') break
      // One start, for the verse. The shape is the word-timing shape with a
      // single entry, so everything that reads a verse start — the mushaf,
      // Talqeen's line segments, the translation view — works unchanged.
      verses.push([a, [seg.time_from]])
    }
    /*
     * Whole surahs only.
     *
     * A partial surah would leave the highlight stuck on the last timed ayah
     * while the recitation carried on past it, which reads as the app having
     * frozen rather than as missing data. Coverage is reported per surah
     * everywhere it is used, so an absent surah is handled; a truncated one
     * is not.
     */
    if (verses.length === AYAHS[n - 1]) {
      surahs[n] = verses
      ayahs += verses.length
    } else if (verses.length) {
      console.log(`  surah ${n}: ${verses.length}/${AYAHS[n - 1]} ayahs — skipped`)
    }
    if (n % 20 === 0) process.stdout.write(`  …${n}\n`)
  }

  const out = {
    unit: 'ms',
    source: `Quranic Universal Library, recitation ${r.qul} — ${r.match}`,
    granularity: 'ayah',
    surahs,
  }
  const file = `data/timings-${r.id}.json`
  const json = JSON.stringify(out)
  writeFileSync(file, json)
  console.log(
    `  ${file} — ${Object.keys(surahs).length} surahs, ${ayahs} ayahs, ` +
      `${(json.length / 1024).toFixed(0)} KB`,
  )
}
