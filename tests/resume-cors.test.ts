import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getDB } from '../src/db/index'
import { downloadChunked } from '../src/download/chunked'

/*
 * Play Store reports, Nov 2026: "can't download the audio". The first 2 MB
 * of a surah landed and every later chunk failed with "Failed to fetch",
 * because a resume sent If-Range — not CORS-safelisted — and archive.org and
 * quranicaudio cannot answer the preflight that forces. Cross-origin hosts
 * now get a plain Range request and the validator is compared afterwards.
 */

const FILE = 5000
const CHUNK = 2000

beforeEach(async () => {
  const db = await getDB()
  for (const store of ['downloads', 'chunks']) {
    if (db.objectStoreNames.contains(store)) await db.clear(store)
  }
})
afterEach(() => vi.unstubAllGlobals())

function host(lastModified: (call: number) => string) {
  const seen: Record<string, string>[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const h = init.headers as Record<string, string>
      seen.push(h)
      const [a, b] = /bytes=(\d+)-(\d+)/.exec(h.Range)!.slice(1).map(Number)
      const end = Math.min(b, FILE - 1)
      if (a >= FILE) return new Response(null, { status: 416 })
      // No Content-Range or ETag: archive.org exposes neither cross-origin.
      return new Response(new Uint8Array(end - a + 1).fill(7), {
        status: 206,
        headers: { 'last-modified': lastModified(seen.length) },
      })
    }),
  )
  return seen
}

describe('resuming from a cross-origin archive', () => {
  it('never sends If-Range, and finishes the file', async () => {
    const seen = host(() => 'Sat, 31 Aug 2024 19:04:31 GMT')
    const blob = await downloadChunked('alafasy', 2, 'https://archive.org/download/x/002.mp3', {
      chunkSize: CHUNK,
      totalBytes: FILE,
    })
    expect(blob.size).toBe(FILE)
    expect(seen.length).toBeGreaterThan(1)
    for (const h of seen) expect(h['If-Range']).toBeUndefined()
  })

  it('starts again when the file changes between chunks', async () => {
    const seen = host((n) => (n === 2 ? 'Mon, 02 Nov 2026 00:00:00 GMT' : 'Sat, 31 Aug 2024 19:04:31 GMT'))
    const blob = await downloadChunked('alafasy', 3, 'https://archive.org/download/x/003.mp3', {
      chunkSize: CHUNK,
      totalBytes: FILE,
    }).catch((e) => e)
    // Call 2 differed from call 1, so the download threw away chunk one and
    // began again from byte 0 rather than splicing two recordings.
    expect(seen[2].Range).toBe(`bytes=0-${CHUNK - 1}`)
    expect(blob).toBeDefined()
  })
})
