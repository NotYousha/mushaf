/**
 * Re-times the changeovers in data/segments.json against the audio we play.
 *
 *   node scripts/refine-segments.mjs                 # measure everything, write
 *   node scripts/refine-segments.mjs --dry           # measure, write nothing
 *   node scripts/refine-segments.mjs --only 1447:2   # one surah
 *   node scripts/refine-segments.mjs --report x.json # keep the measurements
 *   node scripts/refine-segments.mjs --apply x.json  # re-score a saved run
 *
 * build-segments.mjs takes its times from chapter lists typed by hand under a
 * YouTube upload. We play an archive.org encode of the same night, so the two
 * can drift, and a whole second is as fine as anyone types. This script asks
 * the audio itself where the voice changes.
 *
 * There is no ffmpeg here, so the decoder is Chromium's, driven by Playwright:
 * a byte range around the published second is handed to decodeAudioData, and
 * everything after that — mel spectra, the speaker models, the change point —
 * runs inside the page, because shipping a minute of cepstra back over the CDP
 * bridge costs more than computing them does.
 *
 * THE TWO YEARS DISAGREE ABOUT FRAME PADDING
 *
 * A mid-file chunk decodes fine — the decoder resyncs at the next frame header
 * — but the decoded audio starts at t=0, so the chunk's byte offset has to be
 * turned back into a time. 128 kbps at 44.1 kHz is not a whole number of bytes
 * per frame (417.959), and the two years resolve that differently. Walked end
 * to end over whole files:
 *
 *   1446  padding bit set on ~96% of frames, 417.958 B/frame -> 16000.00 B/s
 *   1447  padding bit never set at all, a flat 417 B/frame   -> 15963.28 B/s
 *
 * Dividing by 128000/8 is therefore right for 1446 and 0.23% short for 1447 —
 * a second at seven minutes, nearly seven at the end of Al-Baqarah. Checked
 * against a contiguous decode from byte 0, that error alone accounted for
 * every "correction" an earlier pass thought it had found in 1447, all of them
 * negative and all of them growing with the timestamp. So the rate is walked
 * out of the frame headers per file, and a file whose frames are not one
 * steady bitrate is skipped rather than guessed at.
 *
 * AND 1447 DISAGREES WITH THE PLAYER'S OWN CLOCK
 *
 * That padding difference is not just an inconvenience for this script. It is
 * a bug in what we store, because the app never sees true time: it seeks and
 * reports through HTMLMediaElement.currentTime, and Chromium times a CBR MP3
 * with no Xing header by dividing bytes by the declared bitrate — a flat 16000
 * B/s, padding or no padding. Measured:
 *
 *   haram/1447/114  690135 B   frames say 43.2327s   el.duration 43.133438
 *   haram/1446/114  689633 B   frames say 43.1020s   el.duration 43.102063
 *
 * For 1446 the element agrees with the audio. For 1447 it calls a 5920.0 s
 * Al-Baqarah 5906.41 s, and the compression is in the whole timeline, not just
 * the duration: seeking a real element to 3000 and capturing what it renders
 * gives audio that genuinely sits at 3006.88 s, which bytes/16000 predicts to
 * within 0.02 s. So a boundary stored in true time is seeked to 0.23% of
 * itself too late — 0.7 s at 300 s, 6.9 s at 3000 s.
 *
 * The chapter lists are true time too (their gap against what this script
 * measures is flat at about a second and does not grow with the timestamp:
 * slope 2.8e-5, where already-converted data would show 2.3e-3). So every
 * 1447 boundary is converted on write, measured or not, and storedClock()
 * below re-derives which clock the file is in each time rather than trusting a
 * flag — converting twice would be far worse than never converting at all.
 *
 * WHY THE CHANGE POINT IS NOT THE LONGEST SILENCE
 *
 * These are room recordings: the congregation, the fans and the hall never go
 * quiet, and the handover pause measures 0.4–1.5 s against a floor that ayah
 * ends reach just as often. Taking the longest low-energy gap in a window
 * around the published second lands on an ayah end about as often as on the
 * handover — tried first, and it put boundaries anywhere from 7 s early to 1 s
 * late on the same eight-boundary sample this detector settles inside a
 * second. What actually changes is the voice, so the detector is a
 * speaker-change one: 13 cepstral coefficients per 10 ms, a Gaussian fitted
 * either side of a candidate, and the symmetric divergence between them. The
 * coarse pass finds the peak, then a fine pass fixes the two models well clear
 * of it and walks the frame-wise likelihood ratio to the crossing.
 *
 * WHAT IT WILL NOT DO
 *
 * Nothing is written unless two independent placements of the reference models
 * agree, the two voices are actually separable, and the answer stays near the
 * published second. This data names living scholars against recitation; a
 * confident wrong second is worse than the hand-typed one, so an unresolved
 * boundary keeps its old value and is listed at the end.
 *
 * The opening entry of each surah is left alone. It is a start, not a
 * handover: there is no previous voice to tell the first one from, and every
 * surah publishes it as 4 s — which the audio agrees with, recitation opening
 * between 4.0 and 4.3 s after a short station ident.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * Playwright is not a dependency of this app and should not become one: it
 * pulls a few hundred megabytes of browsers for a script that runs when the
 * segment data is rebuilt, which is rarely. Point PLAYWRIGHT at an install
 * that already exists — any scratch checkout that has one will do:
 *
 *   PLAYWRIGHT=/path/to/somewhere/node_modules/playwright node scripts/refine-segments.mjs
 *
 * Loaded only when something is actually going to be measured, so --apply runs
 * on a machine that has no browser at all.
 */
async function playwright() {
  return import(
    // A path has to become a file: URL before import() will take it on Windows,
    // where "C:/..." reads as a specifier with a protocol of "c".
    process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright'
  ).catch((err) => {
    console.error(`playwright not found (${err.message}); set PLAYWRIGHT to an install that has it`)
    process.exit(1)
  })
}

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const opt = (n) => {
  const i = args.indexOf(n)
  return i < 0 ? null : args[i + 1]
}
const DRY = flag('--dry')
const ONLY = opt('--only')
const LIMIT = Number(opt('--limit') ?? 0)
const REPORT = opt('--report')
const APPLY = opt('--apply')

const SEGMENTS = 'data/segments.json'
const WORKER = 'https://mushaf-audio.mushaftarteel.workers.dev'
const audioUrl = (year, surah) => `${WORKER}/haram/${year}/${surah}.mp3`

/* ---------------- MPEG frames: the byte rate, measured ---------------- */

const KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
const RATES = [44100, 48000, 32000, 0]
const SAMPLES_PER_FRAME = 1152

/** Length in bytes of the MPEG-1 Layer III frame at i, or 0 if there is none. */
function frameLen(b, i) {
  if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return 0
  const version = (b[i + 1] >> 3) & 3
  const layer = (b[i + 1] >> 1) & 3
  const bri = (b[i + 2] >> 4) & 15
  const sri = (b[i + 2] >> 2) & 3
  const pad = (b[i + 2] >> 1) & 1
  if (version !== 3 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) return 0
  return Math.floor((144 * KBPS[bri] * 1000) / RATES[sri]) + pad
}

const frameKind = (b, i) => `${KBPS[(b[i + 2] >> 4) & 15]}@${RATES[(b[i + 2] >> 2) & 3]}`

/**
 * The first byte of a run of six good frames.
 *
 * One 0xff 0xe0 pair means nothing on its own — it turns up inside the audio
 * data several times a second. A chain that walks cleanly through six frames
 * is a real header, and six has been enough that no false start survived it.
 */
function alignFrame(b, from = 0) {
  for (let i = from; i < b.length - 4; i++) {
    let p = i
    let ok = true
    for (let n = 0; n < 6; n++) {
      const len = frameLen(b, p)
      if (!len) {
        ok = false
        break
      }
      p += len
      if (p > b.length - 4) break
    }
    if (ok) return i
  }
  return -1
}

async function range(url, from, to) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Range: `bytes=${from}-${to}` },
        signal: AbortSignal.timeout(90_000),
      })
      if (res.status !== 206) throw new Error(`expected 206, got ${res.status}`)
      return new Uint8Array(await res.arrayBuffer())
    } catch (err) {
      if (attempt === 3) throw err
      await new Promise((r) => setTimeout(r, 900 * (attempt + 1)))
    }
  }
}

/**
 * Bytes per second of a file, walked out of its own frame headers.
 *
 * Sampled at three points rather than one: a file that changed bitrate part
 * way through would read as steady from the front alone, and that is the one
 * shape of file this mapping cannot survive.
 */
async function byteRate(url) {
  const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(60_000) })
  const total = Number(head.headers.get('content-length'))
  if (!total) return { total: 0, rate: null, why: 'no content-length' }
  const spots = [0, 0.3, 0.6].map((f) =>
    Math.min(Math.floor(total * f), Math.max(0, total - 300_000)),
  )
  const kinds = new Set()
  let frames = 0
  let bytes = 0
  for (const spot of spots) {
    const buf = await range(url, spot, spot + 200_000)
    const off = alignFrame(buf)
    if (off < 0) return { total, rate: null, why: 'no frame header' }
    let p = off
    while (p < buf.length - 4) {
      const len = frameLen(buf, p)
      if (!len) break
      kinds.add(frameKind(buf, p))
      frames++
      p += len
    }
    bytes += p - off
  }
  if (kinds.size !== 1) return { total, rate: null, why: `mixed bitrate: ${[...kinds].join(', ')}` }
  const measured = (bytes / frames) * (44100 / SAMPLES_PER_FRAME)
  // Snap to the two shapes these encodes actually take — a flat 417 B/frame or
  // a properly padded 417.959 — so a sampling wobble cannot leak into the map.
  const rate = [(417 * 44100) / SAMPLES_PER_FRAME, 16000].find((r) => Math.abs(measured - r) < 0.5)
  return {
    total,
    rate: rate ?? null,
    measured,
    kind: [...kinds][0],
    why: rate ? null : `odd frame size ${(bytes / frames).toFixed(3)}`,
  }
}

/* ---------------- the analysis, run inside the page ---------------- */

/**
 * Decode a chunk and locate the voice change in it.
 *
 * Everything past the decode stays here: a minute of audio is six thousand
 * frames of 26-band spectrum, and serialising that back to Node costs more
 * than the arithmetic does.
 */
const analyse = async ({ b64, t0, target, searchSec }) => {
  const bin = atob(b64)
  const raw = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i)
  const ctx = new OfflineAudioContext(1, 44100, 44100)
  let audio
  try {
    audio = await ctx.decodeAudioData(raw.buffer)
  } catch (err) {
    return { err: String(err) }
  }
  const x = audio.getChannelData(0)
  const sr = audio.sampleRate
  const N = 1024
  const STEP = Math.round(sr * 0.01)
  const hop = STEP / sr

  const win = new Float32Array(N)
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))
  const rev = new Uint32Array(N)
  for (let i = 0, j = 0; i < N; i++) {
    rev[i] = j
    let m = N >> 1
    while (m >= 1 && j & m) {
      j ^= m
      m >>= 1
    }
    j |= m
  }
  const cs = new Float64Array(N / 2)
  const sn = new Float64Array(N / 2)
  for (let i = 0; i < N / 2; i++) {
    cs[i] = Math.cos((-2 * Math.PI * i) / N)
    sn[i] = Math.sin((-2 * Math.PI * i) / N)
  }
  const re = new Float64Array(N)
  const im = new Float64Array(N)
  const fft = () => {
    for (let len = 2; len <= N; len <<= 1) {
      const half = len >> 1
      const step = N / len
      for (let i = 0; i < N; i += len) {
        for (let k = 0; k < half; k++) {
          const c = cs[k * step]
          const s = sn[k * step]
          const ar = re[i + k + half] * c - im[i + k + half] * s
          const ai = re[i + k + half] * s + im[i + k + half] * c
          re[i + k + half] = re[i + k] - ar
          im[i + k + half] = im[i + k] - ai
          re[i + k] += ar
          im[i + k] += ai
        }
      }
    }
  }

  const NB = 26
  const NC = 13
  const toMel = (f) => 1127 * Math.log(1 + f / 700)
  const fromMel = (m) => 700 * (Math.exp(m / 1127) - 1)
  const lo = toMel(100)
  const hi = toMel(8000)
  const edge = []
  for (let i = 0; i < NB + 2; i++) edge.push((fromMel(lo + ((hi - lo) * i) / (NB + 1)) * N) / sr)

  const frames = Math.floor((x.length - N) / STEP) + 1
  const rms = new Float64Array(frames)
  const ceps = []
  const power = new Float64Array(N / 2 + 1)
  for (let f = 0; f < frames; f++) {
    const off = f * STEP
    let energy = 0
    for (let i = 0; i < N; i++) {
      const v = x[off + i]
      energy += v * v
      re[rev[i]] = v * win[i]
      im[rev[i]] = 0
    }
    rms[f] = Math.sqrt(energy / N)
    fft()
    for (let k = 0; k <= N / 2; k++) power[k] = re[k] * re[k] + im[k] * im[k]
    const band = new Float64Array(NB)
    for (let b = 0; b < NB; b++) {
      const a = edge[b]
      const c = edge[b + 1]
      const d = edge[b + 2]
      let s = 0
      for (let k = Math.ceil(a); k <= Math.min(N / 2, Math.floor(d)); k++) {
        const t = k < c ? (k - a) / (c - a) : (d - k) / (d - c)
        if (t > 0) s += t * power[k]
      }
      band[b] = Math.log(s + 1e-12)
    }
    const c = new Float64Array(NC)
    for (let k = 1; k <= NC; k++) {
      let s = 0
      for (let n = 0; n < NB; n++) s += band[n] * Math.cos((Math.PI * k * (n + 0.5)) / NB)
      c[k - 1] = s * Math.sqrt(2 / NB)
    }
    ceps.push(c)
  }
  // Normalise each coefficient across the window. The hall and the microphone
  // are the same on both sides of a handover; taking them out leaves the part
  // that differs, which is the voice.
  const mean = new Float64Array(NC)
  const sd = new Float64Array(NC)
  for (const c of ceps) for (let k = 0; k < NC; k++) mean[k] += c[k] / ceps.length
  for (const c of ceps) for (let k = 0; k < NC; k++) sd[k] += (c[k] - mean[k]) ** 2 / ceps.length
  for (let k = 0; k < NC; k++) sd[k] = Math.sqrt(sd[k]) + 1e-9
  for (const c of ceps) for (let k = 0; k < NC; k++) c[k] = (c[k] - mean[k]) / sd[k]

  const sorted = Array.from(rms).sort((a, b) => a - b)
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
  // Voiced enough to say something about the voice. Half the median keeps the
  // quiet ends of phrases and drops the pauses, whose spectrum is the room's.
  const voiced = q(0.55) * 0.5

  const model = (a, b) => {
    a = Math.max(0, a)
    b = Math.min(ceps.length, b)
    const m = new Float64Array(NC)
    const v = new Float64Array(NC)
    let n = 0
    for (let j = a; j < b; j++) {
      if (rms[j] < voiced) continue
      n++
      for (let k = 0; k < NC; k++) m[k] += ceps[j][k]
    }
    if (n < 40) return null
    for (let k = 0; k < NC; k++) m[k] /= n
    for (let j = a; j < b; j++) {
      if (rms[j] < voiced) continue
      for (let k = 0; k < NC; k++) v[k] += (ceps[j][k] - m[k]) ** 2
    }
    // The floor keeps a near-constant coefficient from dominating the ratio.
    for (let k = 0; k < NC; k++) v[k] = v[k] / n + 1e-3
    return { m, v, n }
  }
  const divergence = (A, B) => {
    let s = 0
    for (let k = 0; k < NC; k++) {
      s += 0.5 * (A.v[k] / B.v[k] + B.v[k] / A.v[k] - 2)
      s += 0.5 * (A.m[k] - B.m[k]) ** 2 * (1 / A.v[k] + 1 / B.v[k])
    }
    return s
  }

  const at = (t) => Math.round((t - t0) / hop)
  const W = Math.round(8 / hop)
  let peak = null
  const spread = []
  const lowest = Math.max(W, at(target - searchSec))
  const highest = Math.min(ceps.length - W, at(target + searchSec))
  for (let i = lowest; i < highest; i++) {
    const A = model(i - W, i)
    const B = model(i, i + W)
    if (!A || !B) continue
    const d = divergence(A, B)
    spread.push(d)
    if (!peak || d > peak.d) peak = { i, d }
  }
  if (!peak) return { err: 'no candidate had eight seconds of voice on both sides' }
  spread.sort((a, b) => a - b)
  const contrast = peak.d / (spread[Math.floor(spread.length / 2)] + 1e-9)

  /**
   * With the peak found, fix a model well to each side of it and walk the
   * frame-wise likelihood ratio. The coarse peak is only good to a second or
   * so — its windows are eight seconds wide, and a pause on one side drags it
   * — but with both models held still the crossing is sharp.
   */
  const refine = (gap, reach, span) => {
    const g = Math.round(gap / hop)
    const R = Math.round(reach / hop)
    const S = Math.round(span / hop)
    const A = model(peak.i - R, peak.i - g)
    const B = model(peak.i + g, peak.i + R)
    if (!A || !B) return null
    const ll = (c, M) => {
      let s = 0
      for (let k = 0; k < NC; k++) s += -0.5 * Math.log(M.v[k]) - 0.5 * (c[k] - M.m[k]) ** 2 / M.v[k]
      return s
    }
    let run = 0
    let best = { i: peak.i - S, v: 0 }
    for (let j = peak.i - S; j < peak.i + S; j++) {
      if (j < 0 || j >= ceps.length) continue
      if (rms[j] >= voiced) run += ll(ceps[j], B) - ll(ceps[j], A)
      if (-run > best.v) best = { i: j + 1, v: -run }
    }
    return { i: best.i, sep: divergence(A, B) }
  }
  const a = refine(3, 12, 4)
  const b = refine(4, 14, 4)
  if (!a || !b) return { err: 'not enough voice either side of the peak to model it' }

  /**
   * A handover is a splice, and a splice leaves a short quiet.
   *
   * This is what the answer is finally read off. The likelihood crossing lands
   * where the OLD voice stops, because the pause frames are unvoiced and carry
   * no evidence for either model — so on a typical handover it sits at the
   * front of a quiet that runs about a second before the new imam opens. What
   * the app wants is the moment you first hear the new voice, which is the far
   * edge of that quiet. So where the crossing falls inside a gap, or within
   * SNAP of one, the gap's end is the changeover; where it does not, the
   * crossing stands on its own and the row says so.
   */
  const quiet = q(0.55) * 0.35
  const gaps = []
  for (let i = 0; i < rms.length; ) {
    if (rms[i] >= quiet) {
      i++
      continue
    }
    let j = i
    while (j < rms.length && rms[j] < quiet) j++
    if ((j - i) * hop >= 0.25) gaps.push({ from: t0 + i * hop, to: t0 + j * hop })
    i = j
  }
  const t = t0 + a.i * hop
  let near = null
  for (const g of gaps) {
    const d = t < g.from ? g.from - t : t > g.to ? t - g.to : 0
    if (!near || d < near.d) near = { d, from: g.from, to: g.to }
  }
  const SNAP = 0.6

  return {
    coarse: t0 + peak.i * hop,
    contrast,
    fine: t,
    fineAlt: t0 + b.i * hop,
    sep: a.sep,
    gap: near,
    snapped: !!near && near.d <= SNAP,
    changeover: near && near.d <= SNAP ? near.to : t,
    decoded: audio.duration,
  }
}

/* ---------------- driver ---------------- */

// Enough either side that the coarse search (±12 s) and the fine pass's
// reference models (out to 14 s past the peak) both stay inside the window.
const HALF = 28
const SEARCH = 12

const doc = JSON.parse(readFileSync(SEGMENTS, 'utf8'))
const jobs = []
for (const [key, surahs] of Object.entries(doc)) {
  const year = Number(key.split('-')[1])
  for (const [surah, list] of Object.entries(surahs)) {
    if (ONLY && ONLY !== `${year}:${surah}`) continue
    // Index 0 opens the surah; there is no voice before it to tell it from.
    for (let i = 1; i < list.length; i++) {
      jobs.push({
        key,
        year,
        surah: Number(surah),
        i,
        at: list[i][0],
        from: list[i - 1][1],
        to: list[i][1],
      })
    }
  }
}
const queue = LIMIT ? jobs.filter((_, i) => i % Math.ceil(jobs.length / LIMIT) === 0) : jobs

/**
 * Measuring the whole set takes about half an hour of range requests, so a run
 * can be re-scored from a saved --report instead of re-measured. The gates
 * below are judgement calls that were tuned against the measurements; being
 * able to move one without fetching 130 MB again is the difference between
 * checking a threshold and guessing at it.
 */
const results = APPLY ? JSON.parse(readFileSync(APPLY, 'utf8')) : await measure()

async function measure() {
  console.log(`${queue.length} changeovers to re-time`)
  const { chromium } = await playwright()
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto('about:blank')
  const rates = new Map()
  const results = []
  let done = 0
  for (const job of queue) {
    const url = audioUrl(job.year, job.surah)
    if (!rates.has(url)) rates.set(url, await byteRate(url))
    const { rate, total, why } = rates.get(url)
    const row = { ...job, rate }
    if (!rate) {
      row.skip = why
      results.push(row)
      continue
    }
    try {
      const from = Math.max(0, job.at - HALF)
      const startByte = Math.round(from * rate)
      const wanted = Math.min(total - 1, startByte + Math.round(2 * HALF * rate) + 3000)
      const buf = await range(url, startByte, wanted)
      const off = alignFrame(buf)
      if (off < 0) throw new Error('no frame header in the window')
      const out = await page.evaluate(analyse, {
        b64: Buffer.from(buf.slice(off)).toString('base64'),
        t0: (startByte + off) / rate,
        target: job.at,
        searchSec: SEARCH,
      })
      if (out.err) row.skip = out.err
      else Object.assign(row, out)
    } catch (err) {
      row.skip = String(err?.message ?? err)
    }
    results.push(row)
    if (++done % 10 === 0) console.log(`  ${done}/${queue.length}`)
  }
  await browser.close()
  return results
}

/* ---------------- accept or refuse ---------------- */

const MIN_CONTRAST = 3 // the peak must stand above the window's own noise
const MIN_SEP = 6 // and the two voices must actually be separable
const MAX_DISAGREE = 0.35 // the two model placements must land together
const MAX_MOVE = 8 // further than this, the peak found some other event
/**
 * And there must be a real pause at the crossing, at least this long.
 *
 * Both of these came out of checking the answers a different way — decoding a
 * window around each new time and asking, without searching for anything,
 * whether the energy is low before it and rises at it. Every crossing that had
 * no gap near it failed that check flat: 1447/2 at 4796 sat in unbroken
 * recitation, energy 1.06x the window median right through the second it
 * claimed. So did the one that snapped to a 0.25 s flicker, 1446/40, whose
 * "pause" only dips to a quarter of the median and never reaches the floor.
 * Every crossing with a gap of 0.3 s or more passed. A handover we cannot hear
 * a break in is a handover we have not found.
 */
const MIN_GAP = 0.3

for (const r of results) {
  if (r.skip) {
    r.verdict = 'unresolved'
    r.why = r.skip
    continue
  }
  const move = r.changeover - r.at
  if (!(r.contrast >= MIN_CONTRAST)) {
    r.verdict = 'unresolved'
    r.why = `flat divergence (contrast ${r.contrast.toFixed(1)})`
  } else if (!(r.sep >= MIN_SEP)) {
    r.verdict = 'unresolved'
    r.why = `voices too alike (separation ${r.sep.toFixed(1)})`
  } else if (Math.abs(r.fine - r.fineAlt) > MAX_DISAGREE) {
    r.verdict = 'unresolved'
    r.why = `placements disagree by ${Math.abs(r.fine - r.fineAlt).toFixed(2)}s`
  } else if (Math.abs(move) > MAX_MOVE) {
    r.verdict = 'unresolved'
    r.why = `would move ${move.toFixed(1)}s`
  } else if (!r.snapped) {
    r.verdict = 'unresolved'
    r.why = `no pause at the crossing (nearest is ${r.gap ? r.gap.d.toFixed(2) + 's away' : 'none'})`
  } else if (r.gap.to - r.gap.from < MIN_GAP) {
    r.verdict = 'unresolved'
    r.why = `the pause is only ${(r.gap.to - r.gap.from).toFixed(2)}s`
  } else {
    r.verdict = 'ok'
    r.move = move
  }
}

const ok = results.filter((r) => r.verdict === 'ok')
const bad = results.filter((r) => r.verdict !== 'ok')
const moves = ok.map((r) => r.move).sort((a, b) => a - b)
const pick = (p) => moves[Math.min(moves.length - 1, Math.floor(moves.length * p))]
console.log(`\nresolved ${ok.length}/${results.length}`)
if (moves.length) {
  console.log(
    `  shift: min ${moves[0].toFixed(2)}  p25 ${pick(0.25).toFixed(2)}  median ${pick(0.5).toFixed(2)}  p75 ${pick(0.75).toFixed(2)}  max ${moves[moves.length - 1].toFixed(2)}`,
  )
  console.log(
    `  moved more than 1s: ${moves.filter((m) => Math.abs(m) > 1).length}; more than 2s: ${moves.filter((m) => Math.abs(m) > 2).length}`,
  )
}
for (const r of bad) {
  console.log(`  unresolved ${r.year}/${r.surah} #${r.i} at ${r.at}s (${r.from} -> ${r.to}): ${r.why}`)
}

if (REPORT) writeFileSync(REPORT, JSON.stringify(results, null, 1) + '\n')

/**
 * True time is not the time the player counts in. See the block at the top:
 * the 1447 encode never pads, so its real byte rate is 15963.28, but Chromium
 * maps byte to time at a flat 16000 for every CBR MP3 with no Xing header.
 * Everything above is measured in true time, so it has to be converted before
 * it is stored, or `el.currentTime = at` lands 0.23% of `at` too late — half a
 * second at the top of a surah, nearly seven seconds an hour in.
 */
const ELEMENT_RATE = 16000
const toElement = (trueSecs, rate) => (trueSecs * rate) / ELEMENT_RATE

/**
 * Which clock is the file already stored in?
 *
 * Asked rather than assumed, because converting twice is worse than not
 * converting at all and a flag would not survive a second run. If the stored
 * values are true time, the gap between them and what was measured is the
 * ~1 s handover constant and does not grow; if they have already been
 * converted, that gap grows at 0.23% of the timestamp — 2.3e-3 against 2.8e-5,
 * a hundredfold apart, so the two cases cannot be mistaken for each other.
 * Anything in between means something else is wrong and nothing is touched.
 */
function storedClock(key, rows) {
  const usable = rows.filter((r) => r.verdict === 'ok' && doc[key]?.[String(r.surah)])
  if (usable.length < 6) return { clock: 'unknown', why: `only ${usable.length} measured boundaries` }
  const pts = usable.map((r) => {
    const stored = doc[key][String(r.surah)][r.i][0]
    return { t: stored, d: r.changeover - stored }
  })
  const mt = pts.reduce((a, p) => a + p.t, 0) / pts.length
  const md = pts.reduce((a, p) => a + p.d, 0) / pts.length
  const slope =
    pts.reduce((a, p) => a + (p.t - mt) * (p.d - md), 0) /
    pts.reduce((a, p) => a + (p.t - mt) ** 2, 0)
  if (slope < 0.001) return { clock: 'true', slope }
  if (slope > 0.0015) return { clock: 'element', slope }
  return { clock: 'unknown', slope, why: `slope ${slope.toExponential(2)} matches neither clock` }
}

if (!DRY) {
  // Each file carries its own rate: the years are uniform today, but nothing
  // guarantees the next one will be, and a year-wide factor would hide it.
  const rateOf = new Map()
  for (const r of results) if (r.rate) rateOf.set(`${r.year}/${r.surah}`, r.rate)

  for (const [key, surahs] of Object.entries(doc)) {
    const rows = results.filter((r) => r.key === key)
    if (!rows.length) continue
    const year = rows[0].year
    const needed = Object.keys(surahs).filter((surah) => {
      const rate = rateOf.get(`${year}/${surah}`)
      return rate !== undefined && Math.abs(rate - ELEMENT_RATE) >= 0.5
    })
    if (!needed.length) {
      console.log(`
${key}: byte rate matches the ${ELEMENT_RATE} the player assumes; no conversion needed`)
      continue
    }
    const verdict = storedClock(key, rows)
    if (verdict.clock === 'element') {
      console.log(
        `
${key}: already stored in element time (slope ${verdict.slope.toExponential(2)}); not converting again`,
      )
      continue
    }
    if (verdict.clock !== 'true') {
      console.log(`
${key}: cannot tell which clock it is stored in — ${verdict.why}; left in place`)
      continue
    }
    let moved = 0
    const factors = new Set()
    for (const surah of needed) {
      const rate = rateOf.get(`${year}/${surah}`)
      factors.add((rate / ELEMENT_RATE).toFixed(9))
      for (const entry of surahs[surah]) {
        entry[0] = Math.round(toElement(entry[0], rate) * 100) / 100
        moved++
      }
    }
    const skipped = Object.keys(surahs).length - needed.length
    console.log(
      `
${key}: the player counts at ${ELEMENT_RATE} but these files do not; converted ` +
        `${moved} boundaries across ${needed.length} surah(s) to element time ` +
        `(x${[...factors].join(', ')})${skipped ? `; ${skipped} surah(s) already matched` : ''}`,
    )
  }

  let written = 0
  for (const r of ok) {
    const list = doc[r.key][String(r.surah)]
    const value = Math.round(toElement(r.changeover, r.rate ?? ELEMENT_RATE) * 100) / 100
    // segments.json must stay strictly increasing: the app steps through it and
    // the test asserts it. A correction that would cross its neighbour is a
    // correction that is wrong about something, so it is dropped.
    const before = list[r.i - 1][0]
    const after = r.i + 1 < list.length ? list[r.i + 1][0] : Infinity
    if (!(value > before && value < after)) {
      r.verdict = 'unresolved'
      r.why = 'would cross its neighbour'
      console.log(`  unresolved ${r.year}/${r.surah} #${r.i} at ${r.at}s: ${r.why}`)
      continue
    }
    list[r.i][0] = value
    written++
  }
  writeFileSync(SEGMENTS, JSON.stringify(doc, null, 1) + '\n')
  console.log(`\nwrote ${written} corrected changeovers to ${SEGMENTS}`)
} else {
  console.log('\n--dry: nothing written')
}
