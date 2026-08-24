/**
 * Builds data/segments.json — where the reciter changes hands inside a surah.
 *
 *   node scripts/build-segments.mjs
 *
 * A Taraweeh surah is a stitch. Al-Baqarah spans most of the month and is
 * handed between seven or eight imams, and until now the app could name them
 * but not say when each took over — so the portrait sat on whoever came first
 * for an hour and three quarters.
 *
 * The changeover times are published as a chapter list in the per-surah video
 * description:
 *
 *   00:00:00 البسملة
 *   00:00:04 فضيلة الشيخ بدر التركي
 *   00:14:13 فضيلة الشيخ د. الوليد الشمسان
 *
 * They are timed against the same recording the app plays: the videos' own
 * durations match the archive.org tracks to within a couple of seconds.
 *
 * Two sources carry the same text. archive.org mirrors it and does not rate
 * limit, so it goes first; YouTube is asked only for what the mirror is
 * missing, through the InnerTube player endpoint, which answers with a few
 * kilobytes of JSON rather than a megabyte and a half of HTML. Everything
 * fetched is cached under .cache/ so a re-run costs nothing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const YEARS = [
  { place: 'makkah', year: 1447, collection: 61 },
  { place: 'makkah', year: 1446, collection: 49 },
]
const UPLOADER = 'emammoathen1@gmail.com'
const CACHE = '.cache/segments'
mkdirSync(CACHE, { recursive: true })

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const imams = JSON.parse(readFileSync('data/imams.json', 'utf8'))
const surahs = JSON.parse(readFileSync('data/surahs.json', 'utf8'))

/** Compare on letters alone: the honorifics and spacing vary line to line. */
const bare = (s) => String(s ?? '').replace(/[^ء-ي]/g, '')

const matchers = (place) =>
  Object.entries(imams)
    .filter(([, w]) => (w.serves ?? []).includes(place))
    .map(([id, w]) => ({ id, keys: [w.match, w.name].filter(Boolean).map(bare) }))
    .sort((a, b) => Math.max(...b.keys.map((k) => k.length)) - Math.max(...a.keys.map((k) => k.length)))

const nameToSurah = new Map(surahs.map((s) => [bare(s.name), s.surah]))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function cached(key, produce) {
  const file = `${CACHE}/${key.replace(/[^\w.-]/g, '_')}.json`
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  const value = await produce()
  writeFileSync(file, JSON.stringify(value))
  return value
}

/**
 * Turn a description into changeover points.
 *
 * A line naming nobody we know — the basmalah, the channel's own sign-off — is
 * skipped rather than guessed at, and a name repeated back to back is one
 * stretch rather than two.
 */
function chaptersOf(desc, match) {
  const out = []
  for (const line of String(desc || '').split('\n')) {
    const m = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(.+?)\s*$/.exec(line)
    if (!m) continue
    const [, a, b, c, label] = m
    const at = c ? Number(a) * 3600 + Number(b) * 60 + Number(c) : Number(a) * 60 + Number(b)
    if (/البسملة/.test(label)) continue
    const t = bare(label)
    if (!t) continue
    const id = match.find((x) => x.keys.some((k) => t.includes(k) || k.includes(t)))?.id
    if (!id) continue
    if (out.length && out[out.length - 1][1] === id) continue
    // Two names against the same second happen where a line was mistyped.
    // Keeping both leaves a stretch of zero length, which is not a stretch;
    // the first one at that second stands.
    if (out.length && out[out.length - 1][0] >= at) continue
    out.push([at, id])
  }
  return out.sort((x, y) => x[0] - y[0])
}

/* ---------------- archive.org: the mirror, and it does not rate limit ------ */

/**
 * Every item this uploader has, read once and filed by year afterwards.
 *
 * Searching for the year directly returns nothing useful — it lives in the
 * description rather than in any indexed field — so the whole set is fetched
 * and each item filed by what its own text says.
 */
async function archiveAll() {
  return cached('archive-all', async () => {
    const url =
      'https://archive.org/advancedsearch.php?q=' +
      encodeURIComponent(`uploader:"${UPLOADER}"`) +
      '&fl%5B%5D=identifier&fl%5B%5D=title&rows=1200&output=json'
    const j = await (await fetch(url, { signal: AbortSignal.timeout(120_000) })).json()
    const docs = j.response?.docs ?? []
    console.log(`    the uploader has ${docs.length} items; reading them once`)
    const out = []
    let n = 0
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        for (;;) {
          const d = docs.shift()
          if (!d) return
          try {
            const meta = await (
              await fetch(`https://archive.org/metadata/${d.identifier}`, {
                signal: AbortSignal.timeout(60_000),
              })
            ).json()
            out.push({
              title: String(meta.metadata?.title ?? d.title ?? ''),
              desc: String(meta.metadata?.description ?? '').replace(/<[^>]+>/g, '\n'),
            })
          } catch {
            /* one missing item is not worth failing over */
          }
          if (++n % 100 === 0) console.log(`    archive: ${n} read`)
        }
      }),
    )
    return out
  })
}

/** The items whose own text says they belong to this year. */
async function archiveDescriptions(year) {
  const all = await archiveAll()
  return all.filter((r) => String(r.desc + r.title).includes(String(year)))
}

/* ---------------- YouTube: only for what the mirror lacks ---------------- */

async function videoIds(collection) {
  return cached(`ids-${collection}`, async () => {
    const html = await (
      await fetch(`https://tilawatalharamain.com/quran/c/${collection}`, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(90_000),
      })
    ).text()
    const seen = new Set()
    const out = []
    const re = /\/quran\/(\d+)"[\s\S]{0,220}?img\.youtube\.com\/vi\/([A-Za-z0-9_-]{6,})\//g
    let m
    while ((m = re.exec(html))) {
      if (seen.has(m[1])) continue
      seen.add(m[1])
      out.push(m[2])
    }
    return out
  })
}

/** The player endpoint: a few kilobytes of JSON, no key, no watch page. */
async function description(videoId) {
  return cached(`yt-${videoId}`, async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
          body: JSON.stringify({
            context: { client: { clientName: 'WEB', clientVersion: '2.20240401.00.00' } },
            videoId,
          }),
          signal: AbortSignal.timeout(120_000),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const j = await res.json()
        return String(j.videoDetails?.shortDescription ?? '')
      } catch {
        await sleep(4000 * (attempt + 1))
      }
    }
    return ''
  })
}

/* ---------------- build ---------------- */

const out = {}
for (const { place, year, collection } of YEARS) {
  const match = matchers(place)
  const found = new Map()

  console.log(`\n${place} ${year}: reading the archive mirror`)
  for (const row of await archiveDescriptions(year)) {
    const t = bare(String(row.title).replace(/^سورة/, ''))
    let surah = nameToSurah.get(t)
    if (!surah) {
      for (const [k, v] of nameToSurah) {
        if (k && (t.includes(k) || k.includes(t))) {
          surah = v
          break
        }
      }
    }
    if (!surah || found.has(surah)) continue
    const ch = chaptersOf(row.desc, match)
    if (ch.length > 1) found.set(surah, ch)
  }
  console.log(`  ${found.size} surahs with changeovers from the mirror`)

  const ids = await videoIds(collection)
  if (ids.length !== 114) {
    console.warn(`  collection ${collection} lists ${ids.length} videos, not 114`)
  }
  const missing = []
  for (let s = 1; s <= Math.min(114, ids.length); s++) if (!found.has(s)) missing.push(s)
  console.log(`  asking YouTube for ${missing.length} the mirror did not cover`)

  let done = 0
  for (const s of missing) {
    const ch = chaptersOf(await description(ids[s - 1]), match)
    if (ch.length > 1) found.set(s, ch)
    if (++done % 20 === 0) console.log(`    youtube: ${done}/${missing.length}`)
    // Gentle: this endpoint slows sharply when pushed, and the cache means
    // this cost is paid once.
    await sleep(250)
  }

  console.log(`  ${found.size} surahs with changeovers in total`)
  out[`${place}-${year}`] = Object.fromEntries([...found.entries()].sort((a, b) => a[0] - b[0]))
}

writeFileSync('data/segments.json', JSON.stringify(out, null, 1) + '\n')
console.log('\nwrote data/segments.json')

/**
 * The chapter lists are the better record of who recited.
 *
 * The hashtags name the imams of a surah, but not always all of them — one
 * 1446 surah lists a sheikh in its chapters who never appears in its tags. Both
 * come from the same description, so where they disagree it is the tags that
 * are short, and the surah-level attribution is widened to match rather than
 * left contradicting the stretch playing underneath it.
 */
const voicesPath = 'data/voices.json'
const voices = JSON.parse(readFileSync(voicesPath, 'utf8'))
let widened = 0
for (const [key, surahs] of Object.entries(out)) {
  const year = (voices[key] ??= {})
  for (const [surah, list] of Object.entries(surahs)) {
    const named = new Set(year[surah] ?? [])
    const before = named.size
    for (const [, id] of list) named.add(id)
    if (named.size !== before) {
      widened++
      // Keep the chapter order: it is the order they actually recited in.
      const ordered = []
      for (const [, id] of list) if (!ordered.includes(id)) ordered.push(id)
      for (const id of year[surah] ?? []) if (!ordered.includes(id)) ordered.push(id)
      year[surah] = ordered
    }
  }
}
if (widened) {
  writeFileSync(voicesPath, JSON.stringify(voices, null, 1) + '\n')
  console.log(`widened the attribution of ${widened} surah(s) to match their chapters`)
}
for (const [key, map] of Object.entries(out)) {
  const total = Object.values(map).reduce((a, v) => a + v.length, 0)
  console.log(`  ${key}: ${Object.keys(map).length} surahs, ${total} stretches`)
}
