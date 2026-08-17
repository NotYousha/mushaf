export type ChunkedOpts = {
  chunkSize?: number
  onProgress?: (loaded: number, total: number) => void
  signal?: AbortSignal
}

const DEFAULT_CHUNK = 2 * 1024 * 1024 // 2 MB

/**
 * Download via HTTP Range requests.
 *
 * Al-Baqarah is 218 MB. A single-shot fetch that large fails routinely on
 * mobile, so chunking is load-bearing rather than an optimisation: a broken
 * chunk costs 2 MB of refetching instead of the whole surah.
 */
export async function downloadChunked(url: string, opts: ChunkedOpts = {}): Promise<Blob> {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK
  const parts: BlobPart[] = []
  let offset = 0
  let total = Infinity

  while (offset < total) {
    if (opts.signal?.aborted) throw new Error('aborted')

    const res = await fetch(url, {
      headers: { Range: `bytes=${offset}-${offset + chunkSize - 1}` },
      signal: opts.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const cr = res.headers.get('content-range')
    if (cr) {
      const m = /\/(\d+)\s*$/.exec(cr)
      if (m) total = parseInt(m[1], 10)
    }

    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0) break

    parts.push(buf)
    offset += buf.byteLength
    opts.onProgress?.(Math.min(offset, total), total)

    // A server that ignores Range returns the whole body at once.
    if (!cr && buf.byteLength > chunkSize) break
  }

  if (total !== Infinity && offset < total) {
    throw new Error(`incomplete download: got ${offset} of ${total} bytes`)
  }

  return new Blob(parts, { type: 'audio/mpeg' })
}
