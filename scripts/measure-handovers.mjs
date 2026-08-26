/**
 * Re-times the changeovers in data/segments.json by finding the quiet.
 *
 *   node scripts/measure-handovers.mjs                # measure typed marks, dry
 *   node scripts/measure-handovers.mjs --apply        # ...and write them
 *   node scripts/measure-handovers.mjs --all          # every handover, not just typed
 *   node scripts/measure-handovers.mjs --only 1446:9  # one surah
 *   node scripts/measure-handovers.mjs --check        # re-measure and report drift only
 *
 * WHY THIS EXISTS BESIDE refine-segments.mjs
 *
 * That script answers the same question with MFCCs and a Gaussian speaker
 * change test, driven through Playwright because Chromium's decoder was the
 * only one to hand. It is the better instrument in principle and it needs a
 * browser download to run, which meant that when a report came in that the
 * "next reciter" button landed early, the pass could not simply be re-run.
 *
 * Fifty-four of a hundred and sixteen handovers had never been measured at
 * all. They still carried the second someone typed into a YouTube chapter
 * list, and a typist writes the second they notice the change, which is before
 * the new voice opens. Forty of them were measurable here and moved a median
 * 1.06s later. That is the second or two a listener was hearing.
 *
 * This looks for the thing refine-segments.mjs's own comment says the app is
 * actually after — "the far edge of the quiet". A handover is a silence with a
 * new voice on the other side, and a silence is much easier to find than a
 * speaker boundary: an RMS envelope and a threshold relative to the window's
 * median, because a mosque at Taraweeh never reaches a digital floor.
 *
 * It is not a guess dressed as a measurement. Run against the sixty-two
 * boundaries refine-segments.mjs had already resolved, it agrees with them to
 * a median of 0.03s, every one inside 0.25s — two unrelated methods landing on
 * the same event to within a frame and a half. `--check` reruns that.
 *
 * THE CLOCK, WHICH IS THE WHOLE DIFFICULTY
 *
 * A byte range decodes from t=0, so its offset has to become a time, and
 * 128 kbps at 44.1 kHz is not a whole number of bytes per frame (417.959).
 * The two years resolve that differently, walked out of their frame headers:
 *
 *   1446  padding bit set on ~96% of frames -> 16000.00 B/s
 *   1447  padding bit never set, a flat 417 -> 15963.28 B/s
 *
 * And HTMLMediaElement, given a file with no Xing header, maps time to bytes
 * at the nominal 16000 regardless. So for 1447 the player's clock runs 0.23%
 * short of real time, and a measured true time must be scaled by rate/16000
 * before it is stored — the same conversion refine-segments.mjs makes, for the
 * same reason. Confirmed independently here by walking 7194 frames at two
 * points in Al-Baqarah 1447: 417 B every single one.
 *
 * Needs ffmpeg on PATH, or FFMPEG=/path/to/ffmpeg.
 */
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const FF = process.env.FFMPEG ?? 'ffmpeg'
const WORKER = process.env.WORKER_URL ?? 'https://mushaf-audio.mushaftarteel.workers.dev'
const SEG = 'data/segments.json'

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const opt = (f) => {
  const i = args.indexOf(f)
  return i < 0 ? null : args[i + 1]
}
const APPLY = has('--apply')
const ALL = has('--all')
const CHECK = has('--check')
const ONLY = opt('--only')

/** Decode rate for the envelope, and its frame length. */
const SR = 16000
const HOP = 0.01

/** Bytes per second of real audio, from the frame headers of each year. */
const RATE = { 1447: 15963.28, 1446: 16000.0 }
/** The player's clock is bytes/16000, so stored = true * rate/16000. */
const factor = (year) => RATE[year] / 16000

/**
 * How far a mark may move before it is refused.
 *
 * A mark that is a second early is a nuisance. A mark thrown four seconds
 * across a phrase boundary is a wrong recitation on screen, which is worse
 * than the nuisance, so beyond this the measurement is discarded and the typed
 * value kept.
 */
const MAX_MOVE = 4

async function fetchRange(url, from, to) {
  let last
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(url, {
        headers: { Range: `bytes=${Math.max(0, Math.floor(from))}-${Math.floor(to)}` },
        signal: AbortSignal.timeout(90_000),
      })
      if (r.status === 206 || r.status === 200) return Buffer.from(await r.arrayBuffer())
      last = new Error(`HTTP ${r.status}`)
    } catch (e) {
      last = e
    }
    await new Promise((r) => setTimeout(r, 1500 * 2 ** a))
  }
  throw last ?? new Error('range fetch failed')
}

/** Mono 16 kHz PCM from an mp3 fragment. The decoder resyncs at a frame. */
function decode(buf) {
  return new Promise((resolve, reject) => {
    const p = spawn(
      FF,
      ['-hide_banner', '-loglevel', 'error', '-f', 'mp3', '-i', 'pipe:0',
        '-ac', '1', '-ar', String(SR), '-f', 's16le', 'pipe:1'],
      { windowsHide: true },
    )
    const out = []
    let err = ''
    p.stdout.on('data', (d) => out.push(d))
    p.stderr.on('data', (d) => { err += d.toString() })
    p.on('error', (e) => reject(new Error(`ffmpeg: ${e.message}`)))
    p.on('close', (code) => {
      const pcm = Buffer.concat(out)
      if (!pcm.length) return reject(new Error(err.split('\n')[0] || `ffmpeg exit ${code}`))
      const n = Math.floor(pcm.length / 2)
      const a = new Float32Array(n)
      for (let i = 0; i < n; i++) a[i] = pcm.readInt16LE(i * 2) / 32768
      resolve(a)
    })
    p.stdin.on('error', () => {})
    p.stdin.end(buf)
  })
}

/** RMS per 10 ms frame. */
function envelope(pcm) {
  const step = Math.round(SR * HOP)
  const out = new Float32Array(Math.floor(pcm.length / step))
  for (let i = 0; i < out.length; i++) {
    let s = 0
    for (let j = i * step; j < (i + 1) * step; j++) s += pcm[j] * pcm[j]
    out[i] = Math.sqrt(s / step)
  }
  return out
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(s.length / 2)]
}

/**
 * The far edge of the handover pause, in seconds within the window.
 *
 * Asymmetric on purpose. A typed whole second is written at or just before the
 * change, so a candidate pause three seconds EARLIER than the mark is far more
 * likely to be a breath in the old imam's recitation than the handover. Made
 * symmetric, this picked exactly that wrong pause three times in Surah 9 of
 * 1446 and moved those marks the wrong way by nearly three seconds.
 *
 * Chosen by the far edge's distance from the mark, because the far edge is the
 * answer; ties inside 0.4s go to the longer pause.
 */
function findOnset(env, mark, { reachBack = 1.5, reachFwd = 5, minPause = 0.25, quiet = 0.22 } = {}) {
  const med = median(env)
  if (!(med > 0)) return null
  const thr = med * quiet
  const from = Math.max(0, Math.floor((mark - reachBack) / HOP))
  const to = Math.min(env.length, Math.ceil((mark + reachFwd) / HOP))

  const runs = []
  let start = -1
  for (let i = from; i < to; i++) {
    const q = env[i] < thr
    if (q && start < 0) start = i
    if (!q && start >= 0) { runs.push([start, i]); start = -1 }
  }
  if (start >= 0) runs.push([start, to])

  const long = runs.filter(([a, b]) => (b - a) * HOP >= minPause)
  if (!long.length) return null

  let best = null
  for (const [a, b] of long) {
    const d = Math.abs(b * HOP - mark)
    const len = (b - a) * HOP
    if (!best || d < best.d - 0.4 || (Math.abs(d - best.d) <= 0.4 && len > best.len)) {
      best = { d, len, to: b * HOP }
    }
  }
  return best ? { onset: best.to, gap: best.len, dist: best.d } : null
}

/** One boundary, measured. Returns player-clock seconds, or null. */
async function measure(year, surah, storedAt, opts = {}) {
  const f = factor(year)
  const rate = RATE[year]
  const trueAt = storedAt / f
  const pre = opts.pre ?? 10
  const post = opts.post ?? 10
  const buf = await fetchRange(
    `${WORKER}/haram/${year}/${surah}.mp3`,
    (trueAt - pre) * rate,
    (trueAt + post) * rate,
  )
  const env = envelope(await decode(buf))
  const windowStart = Math.max(0, trueAt - pre)
  const hit = findOnset(env, trueAt - windowStart, opts)
  if (!hit) return null
  const onsetTrue = windowStart + hit.onset
  const stored = Math.round(onsetTrue * f * 100) / 100
  return { stored, movedBy: Math.round((stored - storedAt) * 100) / 100, gap: hit.gap }
}

/* ---------------- the pass ---------------- */

const seg = JSON.parse(readFileSync(SEG, 'utf8'))

const jobs = []
for (const [key, surahs] of Object.entries(seg)) {
  const year = Number(key.split('-')[1])
  if (!RATE[year]) continue
  for (const [surah, list] of Object.entries(surahs)) {
    if (ONLY && ONLY !== `${year}:${surah}`) continue
    list.forEach(([at], i) => {
      // The opening entry is not a handover — it is whoever starts the file.
      if (i === 0) return
      const trueSecond = year === 1447 ? at / factor(year) : at
      const typed = Math.abs(trueSecond - Math.round(trueSecond)) <= 0.02
      if (ALL || CHECK || typed) jobs.push({ key, year, surah: Number(surah), i, at, typed })
    })
  }
}

console.log(`${jobs.length} handover(s) to measure${CHECK ? ' (check only)' : ''}`)
console.log('year:surah   stored      measured    move     pause   verdict')

const taken = []
for (const j of jobs) {
  let r = null
  let why = ''
  try {
    r = await measure(j.year, j.surah, j.at)
  } catch (e) {
    why = `ERR ${e.message}`
  }
  let verdict
  if (why) verdict = why
  else if (!r) verdict = 'no pause — kept'
  else if (Math.abs(r.movedBy) > MAX_MOVE) verdict = `${r.movedBy}s is too far — kept`
  else { verdict = 'take'; taken.push({ ...j, r }) }
  console.log(
    `${j.year}:${j.surah}`.padEnd(12),
    String(j.at).padEnd(11),
    (r ? String(r.stored) : '—').padEnd(11),
    (r ? `${r.movedBy >= 0 ? '+' : ''}${r.movedBy}` : '—').padEnd(8),
    (r ? `${r.gap.toFixed(2)}s` : '—').padEnd(7),
    verdict,
  )
}

if (taken.length) {
  const moves = taken.map((t) => t.r.movedBy).sort((a, b) => a - b)
  console.log(`\n${taken.length} of ${jobs.length} measured`)
  console.log(
    `  median ${moves[Math.floor(moves.length / 2)] >= 0 ? '+' : ''}` +
    `${moves[Math.floor(moves.length / 2)].toFixed(2)}s   ` +
    `later ${moves.filter((m) => m > 0).length}   earlier ${moves.filter((m) => m < 0).length}   ` +
    `range ${moves[0].toFixed(2)} .. ${moves.at(-1).toFixed(2)}`,
  )
  // In --check the agreement with what is already stored IS the result.
  if (CHECK) {
    const abs = moves.map(Math.abs).sort((a, b) => a - b)
    console.log(`  agreement with stored: median ${abs[Math.floor(abs.length / 2)].toFixed(2)}s, worst ${abs.at(-1).toFixed(2)}s`)
  }
}

if (APPLY && !CHECK) {
  for (const t of taken) seg[t.key][String(t.surah)][t.i][0] = t.r.stored
  writeFileSync(SEG, `${JSON.stringify(seg, null, 1)}\n`)
  console.log(`\nwrote ${taken.length} boundaries to ${SEG}`)
} else if (!CHECK) {
  console.log('\n(dry run — pass --apply to write)')
}
