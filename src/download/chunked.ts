import {
  assembleBlob,
  commitChunk,
  deleteDownload,
  dlKey,
  getManifest,
  putManifest,
  type Manifest,
} from '../db/downloads'

export type ChunkedOpts = {
  chunkSize?: number
  onProgress?: (loaded: number, total: number) => void
  signal?: AbortSignal
  /**
   * The size the catalog says this surah is, when it is known.
   *
   * Not an optimisation — it is what makes fetching straight from the archive
   * possible. Content-Range is not a CORS-safelisted response header, and
   * archive.org, quranicaudio and mp3quran all send `Access-Control-Allow-
   * Origin: *` without exposing it, so a cross-origin read of it returns null.
   * With no total, the loop below ran on `Infinity` and wrote
   * `totalBytes: buf.byteLength` — the first chunk — so a 138 MB surah was
   * filed as complete after 2 MB and played as two minutes of al-Baqarah with
   * no error anywhere.
   *
   * The server still wins where it speaks: a readable Content-Range overrides
   * this, because the catalog is a measurement from last week and the response
   * is the file as it is now.
   */
  totalBytes?: number
}

const DEFAULT_CHUNK = 2 * 1024 * 1024 // 2 MB
const RETRIES = 3

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(id)
      // A DOMException named AbortError, which is what the platform's own
      // abort contract is and what the queue recognises. A plain Error was
      // filed as a failure, so "Could not save: aborted" appeared after Stop
      // downloading and then re-appeared on every later queue event.
      reject(new DOMException('aborted', 'AbortError'))
    })
  })

/** A quota failure must stop the whole queue, not just this surah. */
export class OutOfSpaceError extends Error {
  constructor() {
    super('out of space')
    this.name = 'OutOfSpaceError'
  }
}

const isQuota = (e: unknown) => {
  const name = (e as { name?: string })?.name
  // Safari has historically reported quota conditions as UnknownError, so an
  // unexplained write failure is treated as possibly-quota rather than
  // retried into a loop.
  return name === 'QuotaExceededError' || name === 'UnknownError'
}

async function fetchRange(
  url: string,
  from: number,
  size: number,
  validator: string | null,
  signal?: AbortSignal,
) {
  const headers: Record<string, string> = { Range: `bytes=${from}-${from + size - 1}` }
  // If the file changed since the last session the server answers 200 with
  // the whole body instead of 206, which is how a stale resume is detected
  // rather than silently splicing two different recordings together.
  //
  // The validator is the ETag where there is one and Last-Modified otherwise —
  // If-Range accepts an HTTP-date. With neither, this header cannot be sent at
  // all, the server has nothing to check, and the resume is unsafe: the caller
  // restarts from zero instead.
  if (validator && from > 0) headers['If-Range'] = validator
  return fetch(url, { headers, signal })
}

/**
 * Download a surah in resumable chunks.
 *
 * Every chunk is committed to storage as it arrives, so losing signal or
 * closing the tab costs one chunk rather than the whole file. Coming back
 * tomorrow continues from the last committed byte, after checking the file
 * has not changed underneath us.
 */
export async function downloadChunked(
  reciterId: string,
  surah: number,
  url: string,
  opts: ChunkedOpts = {},
): Promise<Blob> {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK
  const key = dlKey(reciterId, surah)

  let m = await getManifest(key)

  // A manifest for a different URL describes a different file.
  if (m && m.url !== url) {
    await deleteDownload(key)
    m = undefined
  }

  if (m?.state === 'complete') {
    const blob = await assembleBlob(m)
    if (blob) {
      opts.onProgress?.(m.totalBytes, m.totalBytes)
      return blob
    }
    // Manifest says complete but a chunk is missing — start again.
    await deleteDownload(key)
    m = undefined
  }

  let from = m?.bytesWritten ?? 0
  // The manifest first (it is a measurement of this download), then the
  // catalog hint, then unknown.
  const hinted = opts.totalBytes && opts.totalBytes > 0 ? opts.totalBytes : Infinity
  let total = m?.totalBytes ?? hinted

  /*
   * A resume needs something to prove the file has not changed.
   *
   * With no ETag and no Last-Modified there is nothing to send as If-Range, so
   * the server just honours the range and answers 206 — and the bytes on disk,
   * which came from the file as it was yesterday, get spliced onto bytes from
   * the file as it is today. It completes, reports no error, and plays two
   * different recordings of the same surah. Re-downloading is cheaper than
   * that.
   */
  if (m && from > 0 && !m.etag && !m.lastModified) {
    await deleteDownload(key)
    m = undefined
    from = 0
    total = hinted
  }

  while (from < total) {
    if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError')

    let res: Response | null = null
    let lastError: unknown = null

    for (let attempt = 0; attempt < RETRIES; attempt++) {
      try {
        res = await fetchRange(
          url,
          from,
          chunkSize,
          m?.etag ?? m?.lastModified ?? null,
          opts.signal,
        )
        break
      } catch (e) {
        lastError = e
        if (opts.signal?.aborted) throw e
        // A dropped connection is the normal case on a phone, not a failure.
        await sleep(1000 * 2 ** attempt + Math.random() * 250, opts.signal)
      }
    }
    if (!res) throw lastError instanceof Error ? lastError : new Error('network')

    // The validator did not match: the file changed, so everything already
    // stored is from a different recording and must go.
    if (res.status === 200 && from > 0) {
      void res.body?.cancel()
      await deleteDownload(key)
      m = undefined
      from = 0
      total = hinted
      continue
    }
    if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)

    const cr = res.headers.get('content-range')
    if (cr) {
      const parsed = /\/(\d+)\s*$/.exec(cr)
      if (parsed) total = parseInt(parsed[1], 10)
    }

    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0) break

    if (!m) {
      m = {
        key,
        reciterId,
        surah,
        url,
        type: res.headers.get('content-type') || 'audio/mpeg',
        // Never Infinity. It was used as a local "length unknown" sentinel and
        // then written straight to disk, where both readers derive a loop bound
        // by dividing it by the chunk size — so `Math.ceil(Infinity / n)` gave
        // an endless delete loop that held the queue's only slot for the rest
        // of the session, and survived a reload.
        totalBytes: Number.isFinite(total) ? total : buf.byteLength,
        bytesWritten: 0,
        chunkSize,
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        chunks: 0,
        state: 'partial',
        updatedAt: Date.now(),
      }
      await putManifest(m)
    }

    try {
      m = await commitChunk(m, buf)
    } catch (e) {
      if (isQuota(e)) throw new OutOfSpaceError()
      throw e
    }

    from = m.bytesWritten
    opts.onProgress?.(Math.min(from, total), total)

    // A server that ignored the range returned everything at once.
    if (!cr && buf.byteLength > chunkSize) {
      total = buf.byteLength
      break
    }
  }

  if (!m) throw new Error('nothing downloaded')
  if (m.bytesWritten < m.totalBytes) {
    throw new Error(`incomplete download: ${m.bytesWritten} of ${m.totalBytes} bytes`)
  }

  m = { ...m, state: 'complete' }
  await putManifest(m)

  const blob = await assembleBlob(m)
  if (!blob) throw new Error('stored chunks are missing')
  return blob
}

export type { Manifest }
