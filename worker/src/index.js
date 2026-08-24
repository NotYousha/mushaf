/**
 * CORS proxy for two mushafs the browser cannot fetch directly.
 *
 *   /b/{1-114}.mp3  Burhaji, recorded at the Prophet's Mosque (midad.com).
 *                   Served from a DigitalOcean Spaces bucket behind
 *                   AWS4-presigned URLs: no CORS header, and signatures expire
 *                   after seven days.
 *
 *   /d/{1-114}.mp3  Al-Dosari, produced by the Saudi Center
 *   /t/{1-114}.mp3  Al-Turki, same producer (tilawatalharamain.com). The audio
 *                   host sends no CORS header either, and these mushafs are
 *                   still being recorded, so the lists grow as episodes air.
 *
 *   /j/{1-114}.mp3  Al-Juhany, in the riwayah of Ad-Duri from Abu Amr
 *                   (abdullahjuhany.com). Its files sit on top4top.io, which
 *                   sends no CORS header and is unreachable from some
 *                   networks entirely — the proxy fixes both.
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

/* ---------------- Burhaji: midad ---------------- */
const MIDAD_COLLECTION = '465944'
// Recitation pages for this collection are contiguous and ordered by surah.
const MIDAD_FIRST_ID = 287659
// Signatures last 7 days; refresh well before that.
const MIDAD_TTL = 4 * 24 * 60 * 60

/* ---------------- indexed collections ----------------
 * Three collections on two sites that happen to share a shape: a collection
 * page listing one /quran/{id} page per surah in order, each holding a single
 * <source> tag. One resolver serves all of them.
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
}
const HARAMAIN_INDEX_TTL = 6 * 60 * 60
const HARAMAIN_PAGE_TTL = 7 * 24 * 60 * 60

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
    skip: new Set([1421, 1422, 1423, 1437, 1441, 1443, 1446]),
  },
}

const mosqueYearOk = (m, year) =>
  Number.isInteger(year) && year >= m.first && year <= m.last && !m.skip.has(year)

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
 * The index lists one page per surah in order, so position N is surah N.
 * Verified across every published surah for both collections by comparing
 * page titles against surah names. Returns a JSON array of page ids.
 */
async function resolveHaramainIndex(host, collection) {
  const res = await pageFetch(`${host}/quran/c/${collection}`)
  if (!res.ok) throw new Error(`index returned ${res.status}`)
  const html = await res.text()

  const ids = []
  const seen = new Set()
  const re = /<a[^>]+href="[^"]*\/quran\/(\d+)"/gi
  let m
  while ((m = re.exec(html))) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      ids.push(m[1])
    }
  }
  if (!ids.length) throw new Error('no surah pages found in index')
  return JSON.stringify(ids)
}

async function resolveHaramain(site, surah, ctx) {
  const { host, collection } = site
  const ids = JSON.parse(
    await memo(`haramain-index-${host}-${collection}`, HARAMAIN_INDEX_TTL, ctx, () =>
      resolveHaramainIndex(host, collection),
    ),
  )
  if (surah > ids.length) {
    const err = new Error(
      `surah ${surah} has not been recorded yet (${ids.length} published)`,
    )
    err.notFound = true
    throw err
  }

  const pageId = ids[surah - 1]
  const res = await pageFetch(`${host}/quran/${pageId}`)
  if (!res.ok) throw new Error(`surah page ${pageId} returned ${res.status}`)

  const html = await res.text()
  const m = /<source[^>]+src="([^"]+)"/i.exec(html)
  if (!m) throw new Error(`no audio URL for surah ${surah}`)
  return decodeEntities(m[1])
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
      return new Response(
        JSON.stringify({
          ok: true,
          routes: {
            '/b/{1-114}.mp3': ROUTES.b.name,
            '/d/{1-114}.mp3': ROUTES.d.name,
            '/t/{1-114}.mp3': ROUTES.t.name,
            '/haram/{year}/{1-114}.mp3': `Grand Mosque, ${MOSQUES.haram.first}-${MOSQUES.haram.last}`,
            '/nabawi/{year}/{1-114}.mp3': `Prophet's Mosque, ${MOSQUES.nabawi.first}-${MOSQUES.nabawi.last}`,
            '/h/{1-114}.mp3': 'Grand Mosque 1447 (alias, kept for shipped catalogs)',
          },
          '/count/{d,t}': 'how many surahs are published',
        }),
        { headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    // Lets the refresh job ask how far a recording has got without scraping
    // the index itself.
    const countMatch = /^\/count\/([dtj])$/.exec(url.pathname)
    if (countMatch) {
      const { host, collection } = HARAMAIN[countMatch[1]]
      try {
        const ids = JSON.parse(
          await memo(
            `haramain-index-${host}-${collection}`,
            HARAMAIN_INDEX_TTL,
            ctx,
            () => resolveHaramainIndex(host, collection),
            { fresh: url.searchParams.get('fresh') === '1' },
          ),
        )
        return new Response(JSON.stringify({ published: ids.length, total: SURAH_COUNT }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 502,
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
    const single = /^\/([bdtj])\/(\d{1,3})\.mp3$/.exec(url.pathname)

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
      route = {
        ttl: HARAMAIN_PAGE_TTL,
        // A pure function of mosque, year and surah, so there is nothing to
        // look up and the memo below only ever stores what this returned.
        resolve: () => resolveMosque(m, year, surah),
        name: `${key} ${year} — Taraweeh and Tahajjud`,
      }
      cacheKey = `${key}-${year}-${surah}`
    } else if (single) {
      route = ROUTES[single[1]]
      surah = Number(single[2])
      cacheKey = `${single[1]}-${surah}`
    } else {
      return new Response(
        'Not found. Use /b, /d, /t or /j + /{1-114}.mp3, or /{haram,nabawi}/{year}/{1-114}.mp3',
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
      if (upstream.status === 403 || upstream.status === 404) {
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
