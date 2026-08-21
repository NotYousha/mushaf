/**
 * Builds data/timings-<reciter>.json from a Quranic Universal Audio export.
 *
 * QUA publishes word-level timings under CC BY 4.0. Its Burhaji set was
 * verified against our audio: durations agree to within tens of milliseconds
 * with no drift, so the timings drop straight on with no calibration.
 *
 * Stored as per-verse word start times in milliseconds. Ends are dropped —
 * a word runs until the next one starts, which is what highlighting needs —
 * and that halves the file.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync, brotliCompressSync } from 'node:zlib'

const src = process.argv[2]
const out = process.argv[3]
if (!src || !out) {
  console.error('usage: build-timings.mjs <word_timestamps.json.gz> <out.json>')
  process.exit(1)
}

const raw = JSON.parse(gunzipSync(readFileSync(src)))

const bySurah = {}
let words = 0
let repeats = 0

for (const [key, value] of Object.entries(raw)) {
  const [surah, ayah] = key.split(':').map(Number)
  if (!surah || !ayah) continue
  const [, segments] = value
  if (!Array.isArray(segments)) continue

  const starts = []
  let previousIndex = 0
  for (const seg of segments) {
    const [index, start] = seg
    // A backward step means the reciter repeated; keep the later timing so
    // highlighting follows what is being said now rather than jumping back.
    if (index <= previousIndex) repeats++
    previousIndex = index
    starts[index - 1] = start
    words++
  }
  // Any word the aligner skipped inherits the previous start rather than
  // becoming a hole that stalls the highlight.
  for (let i = 1; i < starts.length; i++) {
    if (starts[i] == null) starts[i] = starts[i - 1] ?? 0
  }
  ;(bySurah[surah] ??= []).push([ayah, starts.filter((n) => n != null)])
}

for (const list of Object.values(bySurah)) list.sort((a, b) => a[0] - b[0])

const json = JSON.stringify({ unit: 'ms', source: 'QUA CC BY 4.0', surahs: bySurah })
writeFileSync(out, json)

console.log(`wrote ${out}`)
console.log(`surahs ${Object.keys(bySurah).length}, words ${words}, repeats ${repeats}`)
console.log(
  `raw ${(json.length / 1024).toFixed(0)} KB, brotli ${(brotliCompressSync(Buffer.from(json)).length / 1024).toFixed(0)} KB`,
)
