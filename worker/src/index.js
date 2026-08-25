/**
 * CORS proxy for two mushafs the browser cannot fetch directly.
 *
 *   /b/{1-114}.mp3  Burhaji, recorded at the Prophet's Mosque (midad.com).
 *                   Served from a DigitalOcean Spaces bucket behind
 *                   AWS4-presigned URLs: no CORS header, and signatures expire
 *                   after seven days.
 *
 *   /d/{1-114}.mp3  Al-Dosari, produced by the Saudi Center
 *                   (tilawatalharamain.com). The audio host sends no CORS
 *                   header either, and the mushaf is still being recorded, so
 *                   the list grows as episodes air.
 *
 *   /t/{1-114}.mp3  Badr Al-Turki, from the Saudi Center's own site. Signed
 *                   R2 URLs that expire after an hour, so nothing about this
 *                   route may be cached for long.
 *
 *   /j/{1-114}.mp3  Al-Juhany, in the riwayah of Ad-Duri from Abu Amr
 *                   (abdullahjuhany.com). Its files sit on top4top.io, which
 *                   sends no CORS header and is unreachable from some
 *                   networks entirely — the proxy fixes both.
 *
 *   /sd/{1-114}.mp3 As-Sudais, /bu/{1-114}.mp3 Al-Buayjan, both produced by
 *                   the Saudi Center and both still being recorded
 *                   (tilawatalharamain.com, same shape as /d).
 *
 *   /af/{1-114}.mp3 Al-Afasy's Hafs from the Ten Readings mushaf of 1445,
 *                   and /az/{1-114}.mp3 Abdulaziz Al-Turki, each a single
 *                   archive.org item.
 *
 *   /haram/{year}/{1-114}.mp3    the Grand Mosque, item Mecca{year}
 *   /nabawi/{year}/{1-114}.mp3   the Prophet's Mosque, item Nabawi{year}
 *                   One archive.org item per Ramadan, each assembled from
 *                   that year's Taraweeh and Tahajjud, 114 files named
 *                   001.mp3 .. 114.mp3. Not every year is served: see
 *                   MOSQUES below and scripts/build-mosque-years.mjs.
 *                   /h/{1-114}.mp3 is Makkah 1447 under the name it first
 *                   shipped with, kept because that catalog is already on
 *                   people's devices.
 *                   Archive.org does send Access-Control-Allow-Origin: *, so
 *                   these look as though they need no proxy — they do.
 *                   Archive sends no Access-Control-Expose-Headers, and
 *                   neither ETag nor Content-Range is CORS-safelisted, so a
 *                   browser reads null for both: no total to size a download
 *                   against and no validator to resume with.
 *
 * Every route resolves the real audio URL on demand, caches that resolution, and
 * stream the file back with CORS attached. Range requests pass through, so
 * seeking works without pulling a whole surah.
 */

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const SURAH_COUNT = 114

/* ---------------- naming a surah from its page title ----------------
 * These collections are indexed by the surah name printed on each link, not
 * by the link's position in the list.
 *
 * Position is the obvious reading and it is wrong. As-Sudais's mushaf is
 * missing al-A'raf — the Saudi Center simply has not aired it — so from that
 * point on the Nth link is surah N+1, and an index built on position would
 * serve al-Anfal to anyone who asked for al-A'raf and go on being one surah
 * out for the rest of the mushaf. Silently: the audio plays, it is the right
 * reciter, and it is the wrong surah. Reading the name off the link cannot
 * make that mistake, and it lets a gap stay a gap.
 *
 * Verified equivalent to the old position-based index on all four collections
 * that were already being served — same page id for every surah — so this is
 * not a change in what plays, only in what can go wrong later.
 */
const SURAH_NAMES = [
  'الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام',
  'الأعراف', 'الأنفال', 'التوبة', 'يونس', 'هود', 'يوسف',
  'الرعد', 'إبراهيم', 'الحجر', 'النحل', 'الإسراء', 'الكهف',
  'مريم', 'طه', 'الأنبياء', 'الحج', 'المؤمنون', 'النور',
  'الفرقان', 'الشعراء', 'النمل', 'القصص', 'العنكبوت', 'الروم',
  'لقمان', 'السجدة', 'الأحزاب', 'سبإ', 'فاطر', 'يس',
  'الصافات', 'ص', 'الزمر', 'غافر', 'فصلت', 'الشورى',
  'الزخرف', 'الدخان', 'الجاثية', 'الأحقاف', 'محمد', 'الفتح',
  'الحجرات', 'ق', 'الذاريات', 'الطور', 'النجم', 'القمر',
  'الرحمن', 'الواقعة', 'الحديد', 'المجادلة', 'الحشر', 'الممتحنة',
  'الصف', 'الجمعة', 'المنافقون', 'التغابن', 'الطلاق', 'التحريم',
  'الملك', 'القلم', 'الحاقة', 'المعارج', 'نوح', 'الجن',
  'المزمل', 'المدثر', 'القيامة', 'الإنسان', 'المرسلات', 'النبإ',
  'النازعات', 'عبس', 'التكوير', 'الانفطار', 'المطففين', 'الانشقاق',
  'البروج', 'الطارق', 'الأعلى', 'الغاشية', 'الفجر', 'البلد',
  'الشمس', 'الليل', 'الضحى', 'الشرح', 'التين', 'العلق',
  'القدر', 'البينة', 'الزلزلة', 'العاديات', 'القارعة', 'التكاثر',
  'العصر', 'الهمزة', 'الفيل', 'قريش', 'الماعون', 'الكوثر',
  'الكافرون', 'النصر', 'المسد', 'الإخلاص', 'الفلق', 'الناس',
]

/** Names these sites actually use that are not the one above. */
const SURAH_ALIASES = {
  'المؤمن': 40,
  'حم السجدة': 41,
  'بني إسرائيل': 17,
  'الدهر': 76,
  'براءة': 9,
  'الانشراح': 94,
  'الشرح والانفتاح': 94,
  'تبت': 111,
  'أبي لهب': 111,
  'اللهب': 111,
}

/**
 * Strips everything that varies between two spellings of the same name:
 * vowel marks, the several shapes of alef and hamza, ta marbuta against ha,
 * alef maqsura against ya, and any punctuation or Latin text around it.
 *
 * Applied to both sides, so it only has to be consistent, not correct Arabic.
 */
function normalizeArabic(str) {
  return str
    .normalize('NFC')
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ‌-‏]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^ء-ي ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalized name -> surah number, longest name first so "قريش" is not read
 *  as "ق", and "الحجر" is not read as "الحج". */
const SURAH_BY_NAME = (() => {
  const map = new Map()
  SURAH_NAMES.forEach((n, i) => map.set(normalizeArabic(n), i + 1))
  for (const [n, i] of Object.entries(SURAH_ALIASES)) {
    const k = normalizeArabic(n)
    if (!map.has(k)) map.set(k, i)
  }
  return [...map.entries()].sort((a, b) => b[0].length - a[0].length)
})()

const SURAH_WORD = normalizeArabic('سورة')

/**
 * The surah a link's own text names, or null when it names none.
 *
 * Null is a refusal, not a default: a title this cannot read must not be
 * guessed at, because the guess would be a wrong surah served confidently.
 */
function surahFromTitle(title) {
  const t = normalizeArabic(title)
  const at = t.indexOf(`${SURAH_WORD} `)
  if (at < 0) return null
  const tail = t.slice(at + SURAH_WORD.length + 1)
  for (const [name, num] of SURAH_BY_NAME) {
    if (tail === name || tail.startsWith(`${name} `)) return num
  }
  // No word boundary after the name — "الفاتحةعبدالرحمن" and the like.
  for (const [name, num] of SURAH_BY_NAME) {
    if (tail.startsWith(name)) return num
  }
  return null
}

/* ---------------- Burhaji: midad ---------------- */
const MIDAD_COLLECTION = '465944'
// Recitation pages for this collection are contiguous and ordered by surah.
const MIDAD_FIRST_ID = 287659
// Signatures last 7 days; refresh well before that.
const MIDAD_TTL = 4 * 24 * 60 * 60

/* ---------------- indexed collections ----------------
 * Collections on two sites that happen to share a shape: a collection page
 * listing one /quran/{id} page per surah, each page holding a single <source>
 * tag, and each link naming its own surah. One resolver serves all of them.
 *
 * A mushaf still being recorded grows over time, so an index is cached for
 * hours, not days.
 */
const HARAMAIN = {
  d: {
    host: 'https://tilawatalharamain.com',
    collection: 64,
    name: 'Al-Dosari — Saudi Center',
  },
  t: {
    host: 'https://tilawatalharamain.com',
    collection: 52,
    name: 'Badr Al-Turki — Saudi Center',
  },
  j: {
    host: 'https://abdullahjuhany.com',
    collection: 5,
    name: 'Al-Juhany — Ad-Duri from Abu Amr',
  },
  sd: {
    host: 'https://tilawatalharamain.com',
    collection: 65,
    name: 'As-Sudais — Saudi Center',
  },
  bu: {
    host: 'https://tilawatalharamain.com',
    collection: 66,
    name: 'Al-Buayjan — Saudi Center',
  },
}
const HARAMAIN_INDEX_TTL = 6 * 60 * 60
const HARAMAIN_PAGE_TTL = 7 * 24 * 60 * 60

/* ---------------- the Saudi Center's own CMS ----------------
 * The centre publishes its mushafs itself, on an itqan-hosted site, and that
 * copy is the master: 256 kbps encoded from WAV, against the 160 kbps
 * YouTube transcodes the same recitations reach the aggregator sites as.
 *
 * One page render carries all 114 URLs, so the index is the page. They are
 * AWS4-presigned against Cloudflare R2 and expire after an hour, which is why
 * nothing here may be cached for long and why an unsigned request gets a 400
 * rather than the file.
 *
 * Two hosts serve the same deployment. Either answers; the second is there
 * for when the first does not.
 */
const ITQAN_HOSTS = [
  'https://qhc.itqan.dev',
  'https://saudi-recitation-center.netlify.app',
]
// Signed for 3600s. Re-resolve well inside that, so a URL handed to a player
// still has most of its life left to stream with.
const ITQAN_TTL = 20 * 60

const ITQAN = {
  t: { mushaf: 11, name: 'Badr Al-Turki — Saudi Center' },
}

/**
 * Every surah URL on a mushaf's page, as surah -> signed URL.
 *
 * The page is a Next.js flight payload: JSON escaped twice over, so the URLs
 * arrive with their ampersands written \u0026 and their quotes backslashed.
 * Both have to be undone before the URL is a URL.
 *
 * The surah number is read from the filename, which is zero-padded and
 * complete — 114 of 114, checked against the numbered track titles beside it.
 */
async function resolveItqanIndex(mushaf) {
  let last = null
  for (const host of ITQAN_HOSTS) {
    try {
      const res = await pageFetch(`${host}/recitations/${mushaf}`)
      if (!res.ok) throw new Error(`page returned ${res.status}`)
      const html = (await res.text()).replace(/\\u0026/g, '&').replace(/\\"/g, '"')

      const map = {}
      const re = new RegExp(
        `https://[^"\\s\\\\]+/assets/${mushaf}/recitations/(\\d{3})\\.mp3\\?[^"\\s\\\\]+`,
        'g',
      )
      let m
      while ((m = re.exec(html))) {
        const surah = Number(m[1])
        if (surah >= 1 && surah <= SURAH_COUNT && !map[surah]) map[surah] = m[0]
      }
      // A render that yielded nothing is a changed page shape, not an empty
      // mushaf, and must not be cached as though the recording vanished.
      if (!Object.keys(map).length) throw new Error('no signed audio URLs on the page')
      return JSON.stringify(map)
    } catch (err) {
      last = err
    }
  }
  throw last ?? new Error('no itqan host answered')
}

async function resolveItqan(site, surah, ctx) {
  const index = JSON.parse(
    await memo(`itqan-index-${site.mushaf}`, ITQAN_TTL, ctx, () =>
      resolveItqanIndex(site.mushaf),
    ),
  )
  const url = index[surah]
  if (!url) {
    const err = new Error(
      `surah ${surah} is not in this mushaf (${Object.keys(index).length} published)`,
    )
    err.notFound = true
    throw err
  }
  return url
}

/* ---------------- whole mushafs held in one archive.org item ----------------
 * Files are named 001.mp3 .. 114.mp3, so the item needs no index of its own —
 * but the names are read from the item's metadata rather than assumed, which
 * is what catches an item that is missing a surah before it can be served as
 * one that is not.
 */
const ARCHIVE_MUSHAFS = {
  af: {
    item: 'alafasy-1445-2024',
    name: "Al-Afasy — Mushaf al-Qira'at al-Ashr 1445, Hafs from Asim",
  },
  /*
   * Abdulaziz Al-Turki. Seven of this item's files are numbered as each
   * other — two straight swaps and a three-cycle — so the file named for a
   * surah is not always the one holding it. Which is which was settled twice
   * over, and independently: the durations match the Saudi Center's own
   * publication of this mushaf to within a fifth of a second across a hundred
   * and five surahs, and separately, scoring every file's length against the
   * letters of the text it claims puts six surahs far outside the band the
   * rest of the mushaf sits in and the remap puts all of them back inside it.
   * The correction itself lives with the catalog, next to Burhaji's, because
   * that is where a surah is pointed at the file that actually holds it.
   */
  az: {
    item: 'x02507ccccc',
    name: 'Abdulaziz Al-Turki — Saudi Center',
  },
}

/* ---------------- the two mosques, by year ----------------
 * Unlike the mushafs above, these are not one sheikh's. Taraweeh and Tahajjud
 * rotate imams across the month, so attribution belongs per surah rather than
 * on the reciter — and since no source records which surah is whose, the app
 * asserts none of it.
 *
 * These Ramadans are over, so the lists do not grow: no index to scrape and
 * no /count route.
 *
 * Items are addressed through archive.org/download rather than the node they
 * currently live on. Nodes rotate and individual ones go unhealthy;
 * /download always redirects to a live one, which the runtime follows.
 */
/**
 * The years each mosque publishes.
 *
 * The skip lists are not arbitrary. Every entry is an item that was checked
 * and found not to be what it claims: one missing a surah outright, two whose
 * file numbering is shifted so Al-Baqarah is not the largest file, two running
 * at half the pace of every other year, four where the Madinah item holds the
 * Makkah recording, and one a listener reported as the wrong recitation.
 * scripts/build-mosque-years.mjs carries the reason for each, and the app's
 * data is generated from the same lists — they must not drift apart.
 */
const MOSQUES = {
  haram: { item: 'Mecca', first: 1414, last: 1447, skip: new Set([1416, 1430, 1443]) },
  nabawi: {
    item: 'Nabawi',
    first: 1416,
    last: 1447,
    skip: new Set([1421, 1422, 1423, 1437, 1441, 1443]),
  },
}

const mosqueYearOk = (m, year) =>
  Number.isInteger(year) && year >= m.first && year <= m.last && !m.skip.has(year)

/**
 * Years served from a different item than the naming scheme implies.
 *
 * The uploader publishes a "حدر مسرع" — sped-up — variant beside the real
 * recording, and for Madinah 1446 that is what the Nabawi1446 item holds:
 * every surah runs at roughly half the length, Al-Baqarah in 54 minutes
 * rather than 107. The audio is not wrong, it is accelerated, which is not
 * what anyone means by that year's Taraweeh. This item is the ordinary-speed
 * copy at the same 128 kbps as the rest of the catalog.
 *
 * Its files are named in Arabic — "002 - البقرة .mp3", with a space before
 * the extension — so the name has to be read from the item rather than built
 * from the surah number, which is why this route resolves through metadata.
 */
const ITEM_OVERRIDES = {
  'nabawi-1446': 'v202506bbbbbb',
}

async function resolveArchiveItem(item, surah, ctx) {
  const names = JSON.parse(
    await memo(`item-files-${item}`, HARAMAIN_PAGE_TTL, ctx, async () => {
      const r = await fetch(`https://archive.org/metadata/${item}`)
      if (!r.ok) throw new Error(`metadata returned ${r.status}`)
      const j = await r.json()
      const map = {}
      for (const f of j.files || []) {
        const m = /^(\d{3})[^/]*\.mp3$/i.exec(f.name)
        if (!m) continue
        const n = Number(m[1])
        // First match wins: some items carry an extra 115th file.
        if (n >= 1 && n <= 114 && !map[n]) map[n] = f.name
      }
      if (Object.keys(map).length < 114) throw new Error(`${item} maps only ${Object.keys(map).length} surahs`)
      return JSON.stringify(map)
    }),
  )
  const name = names[surah]
  if (!name) {
    const err = new Error(`surah ${surah} is not in ${item}`)
    err.notFound = true
    throw err
  }
  return `https://archive.org/download/${item}/${encodeURIComponent(name)}`
}

/**
 * Files are named 001.mp3 through 114.mp3 in every item, with no surah name to
 * encode. The year is bounded rather than interpolated freely, so this cannot
 * be used to fetch arbitrary archive.org items.
 */
const resolveMosque = (m, year, surah) =>
  `https://archive.org/download/${m.item}${year}/${String(surah).padStart(3, '0')}.mp3`

const ALLOWED_ORIGINS = [
  'https://notyousha.github.io',
  'http://localhost:5177',
  'http://127.0.0.1:5177',
]

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, If-Range, If-None-Match, Content-Type',
    // ETag and Last-Modified must be exposed, not merely sent: without this a
    // cross-origin caller reads null and cannot validate a resumed download.
    'Access-Control-Expose-Headers':
      'Content-Length, Content-Range, Accept-Ranges, Content-Type, ETag, Last-Modified',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

const pageFetch = (url) =>
  fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'ar,en;q=0.8',
    },
  })

/** Small Cache-API-backed memo for resolved strings. */
async function memo(key, ttl, ctx, produce, { fresh = false } = {}) {
  const req = new Request(`https://mushaf.internal/${key}`)
  if (!fresh) {
    const hit = await caches.default.match(req)
    if (hit) return await hit.text()
  }

  const value = await produce()
  ctx.waitUntil(
    caches.default.put(
      req,
      new Response(value, { headers: { 'Cache-Control': `max-age=${ttl}` } }),
    ),
  )
  return value
}

async function invalidate(key, value, ttl, ctx) {
  ctx.waitUntil(
    caches.default.put(
      new Request(`https://mushaf.internal/${key}`),
      new Response(value, { headers: { 'Cache-Control': `max-age=${ttl}` } }),
    ),
  )
}

/**
 * Decode HTML entities in an extracted URL.
 *
 * Filenames on these sites contain apostrophes — an-Naba', al-An'am,
 * ash-Shu'ara — which the pages emit as &#039;. Unescaping only &amp; leaves
 * the literal entity in the path and the request 404s. Six Al-Dosari surahs
 * were broken this way.
 */
function decodeEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    // &amp; last, so a double-escaped entity does not decode twice.
    .replace(/&amp;/g, '&')
}

/* ---------------- resolvers ---------------- */

async function resolveMidad(surah) {
  const id = MIDAD_FIRST_ID + (surah - 1)
  const res = await pageFetch(`https://midad.com/recitation/${id}`)
  if (!res.ok) throw new Error(`recitation page ${id} returned ${res.status}`)

  const html = await res.text()
  const padded = String(surah).padStart(3, '0')
  const re = new RegExp(
    `https://[^"'\\\\\\s]*${MIDAD_COLLECTION}/${padded}\\.mp3[^"'\\\\\\s]*`,
    'g',
  )
  const matches = html.match(re)
  if (!matches?.length) throw new Error(`no audio URL for surah ${surah}`)
  const url = matches.find((m) => !m.includes('&amp;')) ?? matches[0]
  return decodeEntities(url)
}

/**
 * Reads the collection page into a surah -> page id map.
 *
 * Each link's own text says which surah it is ("… سورة الكهف …"), so the map
 * is keyed by what the site claims rather than by where the link happens to
 * sit. A link whose surah cannot be read is dropped rather than guessed at,
 * and a collection that yields none at all is an error, not an empty mushaf.
 *
 * First link wins per surah: these pages list each recitation twice, once as
 * a bare thumbnail anchor with no text and once with the title.
 */
async function resolveHaramainIndex(host, collection) {
  const res = await pageFetch(`${host}/quran/c/${collection}`)
  if (!res.ok) throw new Error(`index returned ${res.status}`)
  const html = await res.text()

  const map = {}
  const re = /<a[^>]+href="[^"]*\/quran\/(\d+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = re.exec(html))) {
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, ' '))
    const surah = surahFromTitle(text)
    if (surah && !map[surah]) map[surah] = m[1]
  }
  if (!Object.keys(map).length) throw new Error('no named surah pages in index')
  return JSON.stringify(map)
}

/** The surah -> page id map for a collection, cached. */
async function haramainIndex(site, ctx, opts) {
  const { host, collection } = site
  return JSON.parse(
    await memo(
      `haramain-index-${host}-${collection}`,
      HARAMAIN_INDEX_TTL,
      ctx,
      () => resolveHaramainIndex(host, collection),
      opts,
    ),
  )
}

async function resolveHaramain(site, surah, ctx) {
  const { host } = site
  const index = await haramainIndex(site, ctx)
  const pageId = index[surah]
  if (!pageId) {
    const err = new Error(
      `surah ${surah} is not in this collection (${Object.keys(index).length} published)`,
    )
    err.notFound = true
    throw err
  }

  const res = await pageFetch(`${host}/quran/${pageId}`)
  if (!res.ok) throw new Error(`surah page ${pageId} returned ${res.status}`)

  const html = await res.text()
  const m = /<source[^>]+src="([^"]+)"/i.exec(html)
  if (!m) throw new Error(`no audio URL for surah ${surah}`)
  return decodeEntities(m[1])
}

/**
 * Which surahs a route can actually serve, in order.
 *
 * Scraped where the source is a growing collection, and stated where the
 * source is a finished item — midad's Burhaji is complete but its files are
 * shuffled, so the run 1..114 is the truth about it and the remapping lives
 * in the refresh job.
 */
async function publishedSurahs(key, ctx, opts) {
  if (HARAMAIN[key]) {
    return Object.keys(await haramainIndex(HARAMAIN[key], ctx, opts))
      .map(Number)
      .sort((a, b) => a - b)
  }
  if (ITQAN[key]) {
    const index = JSON.parse(
      await memo(`itqan-index-${ITQAN[key].mushaf}`, ITQAN_TTL, ctx, () =>
        resolveItqanIndex(ITQAN[key].mushaf), opts,
      ),
    )
    return Object.keys(index).map(Number).sort((a, b) => a - b)
  }
  if (ARCHIVE_MUSHAFS[key] || key === 'b') {
    return Array.from({ length: SURAH_COUNT }, (_, i) => i + 1)
  }
  const err = new Error(`unknown route ${key}`)
  err.notFound = true
  throw err
}

/* ---------------- request handling ---------------- */

const ROUTES = {
  b: {
    ttl: MIDAD_TTL,
    resolve: (surah) => resolveMidad(surah),
    name: "Burhaji — Prophet's Mosque",
  },
  d: {
    ttl: HARAMAIN_PAGE_TTL,
    resolve: (surah, ctx) => resolveHaramain(HARAMAIN.d, surah, ctx),
    name: HARAMAIN.d.name,
  },
  t: {
    ttl: HARAMAIN_PAGE_TTL,
    resolve: (surah, ctx) => resolveHaramain(HARAMAIN.t, surah, ctx),
    name: HARAMAIN.t.name,
  },
  j: {
    ttl: HARAMAIN_PAGE_TTL,
    resolve: (surah, ctx) => resolveHaramain(HARAMAIN.j, surah, ctx),
    name: HARAMAIN.j.name,
  },
  sd: {
    ttl: HARAMAIN_PAGE_TTL,
    resolve: (surah, ctx) => resolveHaramain(HARAMAIN.sd, surah, ctx),
    name: HARAMAIN.sd.name,
  },
  bu: {
    ttl: HARAMAIN_PAGE_TTL,
    resolve: (surah, ctx) => resolveHaramain(HARAMAIN.bu, surah, ctx),
    name: HARAMAIN.bu.name,
  },
  af: {
    ttl: HARAMAIN_PAGE_TTL,
    resolve: (surah, ctx) => resolveArchiveItem(ARCHIVE_MUSHAFS.af.item, surah, ctx),
    name: ARCHIVE_MUSHAFS.af.name,
  },
  az: {
    ttl: HARAMAIN_PAGE_TTL,
    resolve: (surah, ctx) => resolveArchiveItem(ARCHIVE_MUSHAFS.az.item, surah, ctx),
    name: ARCHIVE_MUSHAFS.az.name,
  },
}

/**
 * Badr Al-Turki, replacing what /t used to serve.
 *
 * It pointed at an aggregator's copy of his 1441 recording, transcoded from
 * YouTube at about 160 kbps. This is a different performance — ten to twenty
 * per cent slower, 256 kbps from the centre's own masters — and the one the
 * centre publishes as his murattal. The route keeps its letter so that
 * catalogs already on people's devices pick the new recording up without a
 * migration.
 */
ROUTES.t = {
  ttl: ITQAN_TTL,
  resolve: (surah, ctx) => resolveItqan(ITQAN.t, surah, ctx),
  name: ITQAN.t.name,
  /*
   * Repointing a route does not invalidate what it already cached.
   * Resolutions from the old collection were stored under `t-{surah}` with a
   * seven-day life, so without a new namespace the proxy goes on handing out
   * the old recording until they age out — one surah at a time, whichever
   * happened to be warm. Al-Baqarah was still coming back as the old 60 MB
   * m4a while its neighbours had already switched.
   *
   * Bump this string whenever this route's source changes again.
   */
  ns: 't-itqan11',
}

export default {
  async fetch(request, _env, ctx) {
    const origin = request.headers.get('Origin') ?? ''
    const cors = corsHeaders(origin)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: cors })
    }

    const url = new URL(request.url)

    if (url.pathname === '/' || url.pathname === '/health') {
      const routes = {}
      for (const [key, r] of Object.entries(ROUTES)) {
        routes[`/${key}/{1-${SURAH_COUNT}}.mp3`] = r.name
      }
      routes[`/haram/{year}/{1-${SURAH_COUNT}}.mp3`] =
        `Grand Mosque, ${MOSQUES.haram.first}-${MOSQUES.haram.last}`
      routes[`/nabawi/{year}/{1-${SURAH_COUNT}}.mp3`] =
        `Prophet's Mosque, ${MOSQUES.nabawi.first}-${MOSQUES.nabawi.last}`
      routes[`/h/{1-${SURAH_COUNT}}.mp3`] =
        'Grand Mosque 1447 (alias, kept for shipped catalogs)'
      return new Response(
        JSON.stringify({
          ok: true,
          routes,
          '/list/{route}': 'which surahs are published, in order',
          '/count/{route}': 'how many are published',
        }),
        { headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    /*
     * Lets the refresh job ask what a recording actually holds without
     * scraping the index itself.
     *
     * /list is the honest question and /count the old one. A count is only
     * the same thing as a surah list while a mushaf runs 1..N with no gaps,
     * and As-Sudais's does not — it is missing al-A'raf. The refresh job asks
     * for the list and sizes exactly those surahs; /count stays because it is
     * what already-deployed jobs call.
     */
    const listMatch = /^\/(list|count)\/([a-z]{1,3})$/.exec(url.pathname)
    if (listMatch) {
      const [, kind, key] = listMatch
      const fresh = url.searchParams.get('fresh') === '1'
      try {
        const surahs = await publishedSurahs(key, ctx, { fresh })
        const body =
          kind === 'list'
            ? { surahs, published: surahs.length, total: SURAH_COUNT }
            : { published: surahs.length, total: SURAH_COUNT }
        return new Response(JSON.stringify(body), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: err.notFound ? 404 : 502,
          headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
    }

    /*
     * Two path shapes reach the same pipeline.
     *
     *   /{b,d,t,j}/{surah}.mp3      one sheikh's mushaf, resolved by scraping
     *   /haram/{year}/{surah}.mp3   the Grand Mosque, one item per year
     *
     * /h/{surah}.mp3 is the Grand Mosque's 1447 under its original name, kept
     * because it shipped in a catalog that is already on people's devices.
     */
    let route
    let surah
    let cacheKey

    const mosque = /^\/(haram|nabawi)\/(\d{4})\/(\d{1,3})\.mp3$/.exec(url.pathname)
    const legacy = /^\/h\/(\d{1,3})\.mp3$/.exec(url.pathname)
    const single = /^\/([a-z]{1,3})\/(\d{1,3})\.mp3$/.exec(url.pathname)

    if (mosque || legacy) {
      const key = mosque ? mosque[1] : 'haram'
      const m = MOSQUES[key]
      const year = mosque ? Number(mosque[2]) : 1447
      surah = Number(mosque ? mosque[3] : legacy[1])
      if (!mosqueYearOk(m, year)) {
        return new Response(
          `No ${key} mushaf published for ${year}. Years ${m.first}-${m.last}, less those that failed a check.`,
          { status: 404, headers: cors },
        )
      }
      const override = ITEM_OVERRIDES[`${key}-${year}`]
      route = {
        ttl: HARAMAIN_PAGE_TTL,
        // Ordinarily a pure function of mosque, year and surah, so there is
        // nothing to look up. A year served from an override item has Arabic
        // filenames that must be read from the item instead.
        resolve: (_s, c) =>
          override ? resolveArchiveItem(override, surah, c) : resolveMosque(m, year, surah),
        name: `${key} ${year} — Taraweeh and Tahajjud`,
      }
      cacheKey = `${key}-${year}-${surah}`
    } else if (single && ROUTES[single[1]]) {
      route = ROUTES[single[1]]
      surah = Number(single[2])
      cacheKey = `${route.ns ?? single[1]}-${surah}`
    } else {
      return new Response(
        `Not found. Use /{${Object.keys(ROUTES).join(',')}}/{1-${SURAH_COUNT}}.mp3, ` +
          `or /{haram,nabawi}/{year}/{1-${SURAH_COUNT}}.mp3`,
        { status: 404, headers: cors },
      )
    }

    if (!Number.isInteger(surah) || surah < 1 || surah > SURAH_COUNT) {
      return new Response(`Surah must be 1-${SURAH_COUNT}`, { status: 400, headers: cors })
    }

    try {
      let target = await memo(cacheKey, route.ttl, ctx, () => route.resolve(surah, ctx))

      // Forward the conditional headers too. Passing Range alone meant an
      // If-Range resume validated nothing while still returning 206 — a
      // resume that looks correct and silently splices two different files.
      const upstreamHeaders = {}
      for (const h of ['Range', 'If-Range', 'If-None-Match']) {
        const v = request.headers.get(h)
        if (v) upstreamHeaders[h] = v
      }
      let upstream = await fetch(target, { method: request.method, headers: upstreamHeaders })

      // A cached URL that has expired, rotated, or been moved: resolve again.
      // A 200 here is not a failure — it is the server telling a conditional
      // range request that the content changed — so it must not trigger a
      // re-resolve loop.
      // 400 belongs here too: an R2 object asked for without a valid
      // signature answers 400, which is what an expired presigned URL is.
      if (upstream.status === 400 || upstream.status === 403 || upstream.status === 404) {
        target = await route.resolve(surah, ctx)
        await invalidate(cacheKey, target, route.ttl, ctx)
        upstream = await fetch(target, { method: request.method, headers: upstreamHeaders })
      }

      const headers = new Headers(cors)
      for (const h of [
        'Content-Type',
        'Content-Length',
        'Content-Range',
        'Accept-Ranges',
        'ETag',
        'Last-Modified',
      ]) {
        const v = upstream.headers.get(h)
        if (v) headers.set(h, v)
      }
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'audio/mpeg')
      // Only claim range support when the upstream actually honoured a range.
      // Advertising it unconditionally means a player issues a Range request,
      // receives a 200 with the whole body, and either restarts from zero or
      // stalls the seek — which on iOS breaks scrubbing outright.
      if (!headers.has('Accept-Ranges') && upstream.status === 206) {
        headers.set('Accept-Ranges', 'bytes')
      }
      headers.set('Cache-Control', 'public, max-age=86400')

      return new Response(upstream.body, { status: upstream.status, headers })
    } catch (err) {
      // 404 means "does not exist yet", 502 means "we could not reach it".
      // The refresh job relies on telling those apart.
      return new Response(`Surah ${surah}: ${err.message}`, {
        status: err.notFound ? 404 : 502,
        headers: cors,
      })
    }
  },
}
