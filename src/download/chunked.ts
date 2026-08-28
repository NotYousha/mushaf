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
    let buf: ArrayBuffer | null = null
    let lastError: unknown = null
    /** The file changed underneath us; everything stored has to go. */
    let restart = false
    /** The server says there is nothing past `from`; we already have it all. */
    let atEnd = false

    /*
     * The body is read inside the retry, not after it.
     *
     * `fetchRange` resolves as soon as the headers arrive, and on a phone the
     * connection is far likelier to die during the two megabytes that follow
     * than during the handshake. With the read outside, one walk into a tunnel
     * failed the surah outright — and during a "download all" the queue then
     * started the next job, which failed on the same dead connection, and so
     * on: a hundred and fourteen surahs marked failed in about two seconds,
     * with one error message to explain it and nothing left retrying.
     */
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      try {
        res = await fetchRange(
          url,
          from,
          chunkSize,
          m?.etag ?? m?.lastModified ?? null,
          opts.signal,
        )

        // The validator did not match: the file changed, so everything already
        // stored is from a different recording and must go.
        if (res.status === 200 && from > 0) {
          void res.body?.cancel()
          restart = true
          break
        }
        /*
         * 416 on a resume is an answer, not a fault.
         *
         * For the archive.org years there is no readable `Content-Range` — the
         * host sends no `Access-Control-Expose-Headers` — so `total` stays at
         * whatever byte count the shipped catalog claims. If that number is a
         * little too large, the last pass asks for bytes beyond the end of the
         * file and gets 416 forever, on every retry, leaving a stuck partial
         * that can never finish. Reaching the end of the file is what we came
         * for; take it as such.
         */
        if (res.status === 416 && from > 0) {
          void res.body?.cancel()
          atEnd = true
          break
        }
        if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)

        buf = await res.arrayBuffer()
        break
      } catch (e) {
        lastError = e
        res = null
        buf = null
        if (opts.signal?.aborted) throw e
        // A dropped connection is the normal case on a phone, not a failure.
        await sleep(1000 * 2 ** attempt + Math.random() * 250, opts.signal)
      }
    }

    if (restart) {
      await deleteDownload(key)
      m = undefined
      from = 0
      total = hinted
      continue
    }
    if (atEnd) {
      if (m) total = m.bytesWritten
      break
    }
    if (!res || !buf) throw lastError instanceof Error ? lastError : new Error('network')

    const cr = res.headers.get('content-range')
    if (cr) {
      const parsed = /\/(\d+)\s*$/.exec(cr)
      if (parsed) total = parseInt(parsed[1], 10)
    }

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
    /*
     * A full range request answered with less than a full chunk is the end of
     * the file. Without a readable `Content-Range` that is the only signal
     * there is, and taking it matters in the other direction from the 416
     * above: where the catalog's byte count is too *small*, the loop would
     * otherwise stop early, `bytesWritten >= totalBytes` would pass, and a
     * truncated recitation would be stored and served as a complete one.
     */
    if (!cr && buf.byteLength < chunkSize) {
      total = m.bytesWritten
      break
    }
    /*
     * A full chunk landing exactly on the claimed end means the claim is a
     * floor, not a length. Keep asking.
     *
     * This is the other half of the same problem. With no `Content-Range` the
     * only length we have is `data/mosque-years.json`'s byte count, and when
     * that count is too small the loop reached it, stopped, and passed its own
     * completeness check — filing a recitation that stops early as a whole
     * one. Extending by a chunk costs one extra request at the true end, where
     * the 416 branch or the short read above ends it properly.
     */
    if (!cr && from >= total) total = from + chunkSize
  }

  if (!m) throw new Error('nothing downloaded')
  /*
   * Record what the file turned out to be, not what the catalog guessed.
   *
   * `total` is corrected above whenever the download discovers the real end —
   * a 416, a short chunk, a server that ignored the range. The manifest still
   * held the catalog's figure, so the check immediately below compared the
   * bytes actually stored against a number already known to be wrong, and a
   * complete download of an overstated file threw `incomplete download`
   * forever, on every retry.
   */
  if (Number.isFinite(total) && total > 0 && m.totalBytes !== total) {
    m = { ...m, totalBytes: total }
    await putManifest(m)
  }
  if (m.bytesWritten < m.totalBytes) {
    throw new Error(`incomplete download: ${m.bytesWritten} of ${m.totalBytes} bytes`)
  }

  /*
   * Assemble first, mark complete second.
   *
   * These used to run the other way round, and the write was not undone when
   * the assembly then failed — so a surah whose chunks had been deleted
   * underneath the download (cancel and delete race each other; the cancel
   * aborts, but a commit already in flight can land after the delete) was left
   * with a manifest saying `complete` and no bytes behind it. `listDownloaded`
   * then reported it saved, "download all" skipped it forever, and `getAudio`
   * returned nothing: permanently listed as downloaded, permanently silent
   * offline, and with no way to ask for it again.
   */
  const blob = await assembleBlob(m)
  if (!blob) {
    await deleteDownload(key)
    throw new Error('stored chunks are missing')
  }

  m = { ...m, state: 'complete' }
  await putManifest(m)
  return blob
}

export type { Manifest }
