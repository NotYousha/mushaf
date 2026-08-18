/**
 * CORS proxy for the Burhaji mushaf recorded at the Prophet's Mosque.
 *
 * midad.com serves this recording from a DigitalOcean Spaces bucket using
 * AWS4-presigned URLs. Two things stop a browser using them directly:
 *
 *   1. The bucket sends no Access-Control-Allow-Origin header, so a fetch or
 *      an <audio> element on another origin is refused.
 *   2. The signatures carry X-Amz-Expires=604800, so any URL we hardcode dies
 *      after seven days.
 *
 * This Worker fixes both. It resolves a fresh signed URL by reading the
 * recitation page, streams the audio back with CORS headers attached, and
 * caches the resolved URL so a page is read at most once per surah per few
 * days rather than on every range request.
 *
 * Range requests pass straight through, so seeking still works and the
 * browser never has to pull a whole surah to play the middle of it.
 */

const COLLECTION = '465944'
// Recitation pages for this collection are contiguous and ordered by surah.
const FIRST_RECITATION_ID = 287659
const SURAH_COUNT = 114

// Signed URLs last 7 days; refresh well before that so one never expires mid-listen.
const URL_TTL_SECONDS = 4 * 24 * 60 * 60

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

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
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers':
      'Content-Length, Content-Range, Accept-Ranges, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/** Read the recitation page and pull out the presigned URL for this surah. */
async function resolveSignedUrl(surah) {
  const id = FIRST_RECITATION_ID + (surah - 1)
  const page = await fetch(`https://midad.com/recitation/${id}`, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'ar,en;q=0.8',
    },
  })
  if (!page.ok) throw new Error(`recitation page ${id} returned ${page.status}`)

  const html = await page.text()
  const padded = String(surah).padStart(3, '0')

  // The page prints the URL both raw and HTML-escaped; take the raw one.
  const pattern = new RegExp(
    `https://[^"'\\\\\\s]*${COLLECTION}/${padded}\\.mp3[^"'\\\\\\s]*`,
    'g',
  )
  const matches = html.match(pattern)
  if (!matches?.length) throw new Error(`no audio URL found for surah ${surah}`)

  const url = matches.find((m) => !m.includes('&amp;')) ?? matches[0]
  return url.replace(/&amp;/g, '&')
}

/**
 * Cached URL lookup. The Cache API keys on a request, so a synthetic local
 * URL stands in for "the signed URL of surah N".
 */
async function getSignedUrl(surah, ctx) {
  const cacheKey = new Request(`https://mushaf.internal/signed/${surah}`)
  const cache = caches.default

  const hit = await cache.match(cacheKey)
  if (hit) return await hit.text()

  const signed = await resolveSignedUrl(surah)
  const entry = new Response(signed, {
    headers: { 'Cache-Control': `max-age=${URL_TTL_SECONDS}` },
  })
  ctx.waitUntil(cache.put(cacheKey, entry))
  return signed
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
          mushaf: 'Burhaji — Prophet’s Mosque',
          collection: COLLECTION,
          surahs: SURAH_COUNT,
          usage: '/b/{1-114}.mp3',
        }),
        { headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    const match = /^\/b\/(\d{1,3})\.mp3$/.exec(url.pathname)
    if (!match) {
      return new Response('Not found. Use /b/{1-114}.mp3', {
        status: 404,
        headers: cors,
      })
    }

    const surah = Number(match[1])
    if (!Number.isInteger(surah) || surah < 1 || surah > SURAH_COUNT) {
      return new Response(`Surah must be 1-${SURAH_COUNT}`, {
        status: 400,
        headers: cors,
      })
    }

    try {
      let signed = await getSignedUrl(surah, ctx)

      const range = request.headers.get('Range')
      const upstreamHeaders = range ? { Range: range } : {}

      let upstream = await fetch(signed, {
        method: request.method,
        headers: upstreamHeaders,
      })

      // A cached signature that has expired or been rotated: resolve once more.
      if (upstream.status === 403) {
        signed = await resolveSignedUrl(surah)
        const refreshed = new Response(signed, {
          headers: { 'Cache-Control': `max-age=${URL_TTL_SECONDS}` },
        })
        ctx.waitUntil(
          caches.default.put(
            new Request(`https://mushaf.internal/signed/${surah}`),
            refreshed,
          ),
        )
        upstream = await fetch(signed, { method: request.method, headers: upstreamHeaders })
      }

      const headers = new Headers(cors)
      for (const h of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
        const v = upstream.headers.get(h)
        if (v) headers.set(h, v)
      }
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'audio/mpeg')
      if (!headers.has('Accept-Ranges')) headers.set('Accept-Ranges', 'bytes')
      headers.set('Cache-Control', 'public, max-age=86400')

      return new Response(upstream.body, { status: upstream.status, headers })
    } catch (err) {
      return new Response(`Could not reach the audio for surah ${surah}: ${err.message}`, {
        status: 502,
        headers: cors,
      })
    }
  },
}
