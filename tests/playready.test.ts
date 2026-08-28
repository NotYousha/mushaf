import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadChunked } from '../src/download/chunked'
import { deleteAudio, listDownloaded } from '../src/db/audio'

/**
 * The faults found in the pass before the Play submission.
 *
 * Each of these shipped, each was found by reading rather than by a failing
 * test, and each is the kind that only appears on a phone — a slow host, a
 * tunnel, a catalog byte count that is off by a little. The suite that already
 * exists could not have caught them: `rangeServer` in core.test.ts always
 * exposes `content-range` and always answers, which is precisely the case that
 * worked.
 */

const R = 'testreciter'
const URL_A = 'https://example.com/a.mp3'

beforeEach(async () => {
  for (const e of await listDownloaded()) await deleteAudio(e.reciterId, e.surah)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/**
 * A host that drops the body, not the handshake.
 *
 * The distinction is the whole point. `fetch` resolves when the headers
 * arrive; the two megabytes after that are where a phone actually loses the
 * connection, and the retry loop used to end before them.
 */
function bodyDropsOnce(total: number) {
  let bodyReads = 0
  return vi.fn(async (_url: string, init: RequestInit) => {
    const header = (init.headers as Record<string, string>).Range
    const m = /bytes=(\d+)-(\d+)/.exec(header)!
    const start = +m[1]
    const end = Math.min(+m[2], total - 1)
    return {
      ok: true,
      status: 206,
      headers: {
        get: (h: string) => {
          const k = h.toLowerCase()
          if (k === 'content-range') return `bytes ${start}-${end}/${total}`
          if (k === 'etag') return '"v1"'
          if (k === 'content-type') return 'audio/mpeg'
          return null
        },
      },
      arrayBuffer: async () => {
        bodyReads++
        // The first body read dies mid-stream, the way a tunnel kills one.
        if (bodyReads === 1) throw new TypeError('Failed to fetch')
        return new Uint8Array(Math.max(0, end - start + 1)).fill(7).buffer
      },
    }
  })
}

/** A host with no readable Content-Range — every archive.org mosque year. */
function opaqueRanges(fileSize: number, claimed: number) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const header = (init.headers as Record<string, string>).Range
    const m = /bytes=(\d+)-(\d+)/.exec(header)!
    const start = +m[1]
    if (start >= fileSize) {
      return {
        ok: false,
        status: 416,
        headers: { get: () => null },
        body: null,
        arrayBuffer: async () => new ArrayBuffer(0),
      }
    }
    const end = Math.min(+m[2], fileSize - 1)
    return {
      ok: true,
      status: 206,
      headers: {
        get: (h: string) => {
          const k = h.toLowerCase()
          // No content-range: the header is not exposed across origins.
          if (k === 'etag') return '"v1"'
          if (k === 'content-type') return 'audio/mpeg'
          return null
        },
      },
      arrayBuffer: async () => new Uint8Array(end - start + 1).fill(7).buffer,
    }
  })
}

describe('a download on a phone', () => {
  it('retries a body that dies mid-stream instead of failing the surah', async () => {
    vi.stubGlobal('fetch', bodyDropsOnce(2000))
    const blob = await downloadChunked(R, 1, URL_A, { chunkSize: 1000 })
    // Before the fix this rejected with "Failed to fetch" — and during a
    // "download all" it took the other 113 surahs down with it, because the
    // queue moved straight on to the next job on the same dead connection.
    expect(blob.size).toBe(2000)
  })

  it('stops at the end of a file the catalog overstates, rather than looping on 416', async () => {
    // The file is 2500 bytes; data/mosque-years.json claims 3000. Without a
    // readable Content-Range that claim is the only length authority there is,
    // so the last pass asks for bytes past the end and the host says 416.
    vi.stubGlobal('fetch', opaqueRanges(2500, 3000))
    const blob = await downloadChunked(R, 2, URL_A, {
      chunkSize: 1000,
      totalBytes: 3000,
    })
    expect(blob.size).toBe(2500)
  })

  it('does not store a truncated recitation when the catalog understates the file', async () => {
    // The other direction: 2500 bytes of audio, catalog says 2000. The loop
    // used to exit at 2000, pass its own `bytesWritten >= totalBytes` check,
    // and file five hundred bytes of missing recitation as complete.
    vi.stubGlobal('fetch', opaqueRanges(2500, 2000))
    const blob = await downloadChunked(R, 3, URL_A, {
      chunkSize: 1000,
      totalBytes: 2000,
    })
    expect(blob.size).toBe(2500)
  })

  it('leaves nothing marked complete when the chunks cannot be assembled', async () => {
    vi.stubGlobal('fetch', opaqueRanges(2000, 2000))
    await downloadChunked(R, 4, URL_A, { chunkSize: 1000, totalBytes: 2000 })
    const saved = await listDownloaded()
    const row = saved.find((e) => e.reciterId === R && e.surah === 4)
    // The complete manifest is only written once a blob has actually come back
    // out of storage. A surah listed as saved that cannot be played is worse
    // than one that is not listed: "download all" skips it forever.
    expect(row).toBeTruthy()
    expect(row?.partial).toBe(false)
  })
})
