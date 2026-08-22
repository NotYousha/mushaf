import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  putAudio,
  getAudio,
  deleteAudio,
  listDownloaded,
  purgeSuspectAudio,
} from '../src/db/audio'
import { savePosition, loadPosition } from '../src/db/prefs'
import { buildView, loadCatalog } from '../src/catalog/load'
import { effectiveVerified, setVerdict, getVerdicts } from '../src/catalog/verification'
import { downloadChunked } from '../src/download/chunked'
import { DownloadQueue } from '../src/download/queue'
import { canDownloadAll } from '../src/storage/quota'
import { nextSurah, prevSurah } from '../src/player/playQueue'
import { formatBytes, formatTime } from '../src/ui/format'
import { importFiles } from '../src/sources/ImportSource'
import { CatalogSource } from '../src/sources/CatalogSource'
import catalog from '../data/catalog.json'
import meta from '../data/surahs.json'

const dosari = catalog.reciters.find((r) => r.id === 'dosari')!
// The catalog grows as episodes air, so tests compare against it rather than
// against a number that goes stale every week.
const DOSARI_COUNT = dosari.surahs.length
const R = 'dosari'

describe('audio store', () => {
  beforeEach(async () => {
    for (const e of await listDownloaded()) await deleteAudio(e.reciterId, e.surah)
  })

  it('round-trips a blob', async () => {
    await putAudio(R, 18, new Blob([new Uint8Array([1, 2, 3])]), 'catalog')
    const got = await getAudio(R, 18)
    expect(got?.size).toBe(3)
  })

  it('returns null for a surah never stored', async () => {
    expect(await getAudio(R, 99)).toBeNull()
  })

  it('lists sizes and source', async () => {
    await putAudio(R, 2, new Blob([new Uint8Array(20)]), 'import')
    const list = await listDownloaded()
    expect(list.find((e) => e.surah === 2)).toMatchObject({ bytes: 20, sourceId: 'import' })
  })

  it('deletes', async () => {
    await putAudio(R, 5, new Blob([new Uint8Array(4)]), 'catalog')
    await deleteAudio(R, 5)
    expect(await getAudio(R, 5)).toBeNull()
  })

  it('purges audio saved before the queue fix, keeping newer entries', async () => {
    // Entries written while the queue could file audio under the wrong
    // reciter cannot be told apart from good ones, so all of them go.
    await putAudio(R, 10, new Blob([new Uint8Array(4)]), 'catalog')
    const cutoff = Date.now() + 1000
    const removed = await purgeSuspectAudio(cutoff)
    expect(removed).toBeGreaterThanOrEqual(1)
    expect(await getAudio(R, 10)).toBeNull()

    await putAudio(R, 11, new Blob([new Uint8Array(4)]), 'catalog')
    expect(await purgeSuspectAudio(0)).toBe(0)
    expect(await getAudio(R, 11)).not.toBeNull()
  })
})

describe('resume position', () => {
  it('round-trips and overwrites', async () => {
    await savePosition(R, 2, 10)
    await savePosition('burhaji', 3, 20.5)
    expect(await loadPosition()).toEqual({ reciterId: 'burhaji', surah: 3, seconds: 20.5 })
  })
})

describe('catalog view', () => {
  it('always returns 114 entries', () => {
    expect(buildView(dosari as never, meta as never)).toHaveLength(114)
  })

  it('marks released vs unrecorded', () => {
    const v = buildView(dosari as never, meta as never)
    expect(v).toHaveLength(114)
    // Derived from the catalog, not hardcoded: this mushaf is still being
    // recorded, so any fixed surah number eventually flips from unreleased to
    // released and breaks the test for no good reason.
    expect(v.find((s) => s.surah === 1)!.released).toBe(true)
    expect(v.find((s) => s.surah === DOSARI_COUNT)!.released).toBe(true)
    if (DOSARI_COUNT < 114) {
      const beyond = v.find((s) => s.surah === DOSARI_COUNT + 1)!
      expect(beyond.released).toBe(false)
      expect(beyond.url).toBeNull()
    }
  })

  it('falls back to bundled data when the remote refresh fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const rs = await loadCatalog('https://example.com/catalog.json')
    expect(rs.find((r) => r.id === 'dosari')!.surahs).toHaveLength(DOSARI_COUNT)
    vi.unstubAllGlobals()
  })

  it('refuses a remote catalog that would remove surahs', async () => {
    const truncated = {
      ...catalog,
      reciters: catalog.reciters.map((r) => ({ ...r, surahs: r.surahs.slice(0, 5) })),
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => truncated }))
    const rs = await loadCatalog('https://example.com/catalog.json')
    expect(rs.find((r) => r.id === 'dosari')!.surahs).toHaveLength(DOSARI_COUNT)
    vi.unstubAllGlobals()
  })

  it('accepts a remote catalog that adds surahs', async () => {
    const grown = {
      ...catalog,
      reciters: catalog.reciters.map((r) =>
        r.id === 'dosari'
          ? {
              ...r,
              surahs: [
                ...r.surahs,
                {
                  surah: 999,
                  name: 'ص',
                  url: 'https://archive.org/download/x/38.mp3',
                  fallbackUrl: null,
                  bytes: 10,
                  verified: true,
                },
              ],
            }
          : r,
      ),
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => grown }))
    const rs = await loadCatalog('https://example.com/catalog.json')
    expect(rs.find((r) => r.id === 'dosari')!.surahs).toHaveLength(DOSARI_COUNT + 1)
    vi.unstubAllGlobals()
  })

  it('keeps each reciter separate', async () => {
    const rs = await loadCatalog()
    expect(rs.find((r) => r.id === 'burhaji-nabawi')!.surahs.length).toBeGreaterThan(100)
    expect(rs.find((r) => r.id === 'dosari')!.surahs).toHaveLength(DOSARI_COUNT)
  })
})

describe('verification', () => {
  const view = (surah: number, verified: boolean) =>
    ({ surah, verified }) as never

  it('uses the catalog flag when there is no verdict', () => {
    expect(effectiveVerified(R, view(1, true), {})).toBe(true)
    expect(effectiveVerified(R, view(3, false), {})).toBe(false)
  })

  it('lets a user verdict override in both directions', () => {
    expect(effectiveVerified(R, view(3, false), { 'dosari:3': 'ok' })).toBe(true)
    expect(effectiveVerified(R, view(1, true), { 'dosari:1': 'wrong' })).toBe(false)
    // a verdict for one reciter must not leak to the other
    expect(effectiveVerified('burhaji', view(3, false), { 'dosari:3': 'ok' })).toBe(false)
  })

  it('persists verdicts', async () => {
    await setVerdict(R, 27, 'ok')
    expect((await getVerdicts())['dosari:27']).toBe('ok')
  })
})

type ServerOpts = {
  /** Records the size of every chunk actually served. */
  asked?: number[]
  /** Abort this controller instead of serving call number `call`. */
  abortAt?: { call: number; controller: AbortController }
  /** Serve nothing once this many bytes have gone out, without erroring. */
  truncateAfter?: number
}

function rangeServer(total: number, opts: ServerOpts = {}) {
  let calls = 0
  let served = 0
  return vi.fn(async (_url: string, init: RequestInit) => {
    calls++
    if (opts.abortAt && calls === opts.abortAt.call) {
      opts.abortAt.controller.abort()
      throw new Error('aborted')
    }
    const header = (init.headers as Record<string, string>).Range
    const m = /bytes=(\d+)-(\d+)/.exec(header)!
    const start = +m[1]
    const end = Math.min(+m[2], total - 1)
    const truncated = opts.truncateAfter !== undefined && served >= opts.truncateAfter
    const body = new Uint8Array(truncated ? 0 : Math.max(0, end - start + 1)).fill(7)
    served += body.byteLength
    opts.asked?.push(body.byteLength)
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
      arrayBuffer: async () => body.buffer,
    }
  })
}

/**
 * Answers the first conditional range with 200 and the whole body, which is
 * how a server says "this file changed since you last asked".
 */
function changedServer(total: number) {
  let announced = false
  return vi.fn(async (_url: string, init: RequestInit) => {
    const header = (init.headers as Record<string, string>).Range
    const m = /bytes=(\d+)-(\d+)/.exec(header)!
    if (!announced && +m[1] > 0) {
      announced = true
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array(total).fill(9).buffer,
        body: { cancel: () => {} },
      }
    }
    const start = +m[1]
    const end = Math.min(+m[2], total - 1)
    const body = new Uint8Array(Math.max(0, end - start + 1)).fill(9)
    return {
      ok: true,
      status: 206,
      headers: {
        get: (h: string) => {
          const k = h.toLowerCase()
          if (k === 'content-range') return `bytes ${start}-${end}/${total}`
          if (k === 'etag') return '"v2"'
          return null
        },
      },
      arrayBuffer: async () => body.buffer,
    }
  })
}

describe('downloadChunked', () => {
  const R = 'testrec'
  const URL_A = 'https://x/y.mp3'

  beforeEach(async () => {
    for (const e of await listDownloaded()) await deleteAudio(e.reciterId, e.surah)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('assembles a file from chunks', async () => {
    vi.stubGlobal('fetch', rangeServer(2500))
    const blob = await downloadChunked(R, 1, URL_A, { chunkSize: 1000 })
    expect(blob.size).toBe(2500)
  })

  it('reports progress to completion', async () => {
    vi.stubGlobal('fetch', rangeServer(3000))
    const seen: number[] = []
    await downloadChunked(R, 2, URL_A, {
      chunkSize: 1000,
      onProgress: (l: number) => seen.push(l),
    })
    expect(seen.at(-1)).toBe(3000)
  })

  it('resumes from stored bytes instead of downloading the file again', async () => {
    // Interrupt after two chunks, the way closing the tab would.
    const ac = new AbortController()
    vi.stubGlobal('fetch', rangeServer(5000, { abortAt: { call: 3, controller: ac } }))
    await expect(
      downloadChunked(R, 3, URL_A, { chunkSize: 1000, signal: ac.signal }),
    ).rejects.toThrow()

    const partial = (await listDownloaded()).find((e) => e.surah === 3)
    expect(partial?.partial).toBe(true)
    expect(partial?.bytes).toBe(2000)

    const asked: number[] = []
    vi.stubGlobal('fetch', rangeServer(5000, { asked }))
    const blob = await downloadChunked(R, 3, URL_A, { chunkSize: 1000 })
    expect(blob.size).toBe(5000)
    // The second run fetched only the missing 3000 bytes.
    expect(asked.reduce((a, b) => a + b, 0)).toBe(3000)
  })

  it('returns the stored copy without hitting the network again', async () => {
    vi.stubGlobal('fetch', rangeServer(2000))
    await downloadChunked(R, 4, URL_A, { chunkSize: 1000 })
    const second = vi.fn()
    vi.stubGlobal('fetch', second)
    const blob = await downloadChunked(R, 4, URL_A, { chunkSize: 1000 })
    expect(blob.size).toBe(2000)
    expect(second).not.toHaveBeenCalled()
  })

  it('discards stored bytes when the file changed underneath it', async () => {
    const ac = new AbortController()
    vi.stubGlobal('fetch', rangeServer(4000, { abortAt: { call: 3, controller: ac } }))
    await expect(
      downloadChunked(R, 5, URL_A, { chunkSize: 1000, signal: ac.signal }),
    ).rejects.toThrow()

    vi.stubGlobal('fetch', changedServer(4000))
    const blob = await downloadChunked(R, 5, URL_A, { chunkSize: 1000 })
    expect(blob.size).toBe(4000)
    // Every byte is from the new file; none of the stale partial survived.
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(bytes.every((b) => b === 9)).toBe(true)
  })

  it('starts over when the URL for a stored partial has changed', async () => {
    const ac = new AbortController()
    vi.stubGlobal('fetch', rangeServer(4000, { abortAt: { call: 3, controller: ac } }))
    await expect(
      downloadChunked(R, 6, URL_A, { chunkSize: 1000, signal: ac.signal }),
    ).rejects.toThrow()

    const asked: number[] = []
    vi.stubGlobal('fetch', rangeServer(4000, { asked }))
    const blob = await downloadChunked(R, 6, 'https://x/moved.mp3', { chunkSize: 1000 })
    expect(blob.size).toBe(4000)
    expect(asked.reduce((a, b) => a + b, 0)).toBe(4000)
  })

  it('throws rather than returning a short file', async () => {
    vi.stubGlobal('fetch', rangeServer(3000, { truncateAfter: 1000 }))
    await expect(downloadChunked(R, 7, URL_A, { chunkSize: 1000 })).rejects.toThrow(
      /incomplete/,
    )
  })

  it('leaves a short download resumable rather than deleting it', async () => {
    vi.stubGlobal('fetch', rangeServer(3000, { truncateAfter: 1000 }))
    await expect(downloadChunked(R, 8, URL_A, { chunkSize: 1000 })).rejects.toThrow()
    const entry = (await listDownloaded()).find((e) => e.surah === 8)
    expect(entry?.partial).toBe(true)
    expect(entry?.totalBytes).toBe(3000)
  })
})

describe('partial downloads', () => {
  beforeEach(async () => {
    for (const e of await listDownloaded()) await deleteAudio(e.reciterId, e.surah)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('does not hand back audio for a download that never finished', async () => {
    const ac = new AbortController()
    vi.stubGlobal('fetch', rangeServer(4000, { abortAt: { call: 3, controller: ac } }))
    await expect(
      downloadChunked('rec', 12, 'https://x/y.mp3', { chunkSize: 1000, signal: ac.signal }),
    ).rejects.toThrow()

    // Playing half a file would be worse than not playing it: the surah would
    // cut off mid-ayah with no explanation.
    expect(await getAudio('rec', 12)).toBeNull()
  })

  it('reports how much of an unfinished download is stored', async () => {
    const ac = new AbortController()
    vi.stubGlobal('fetch', rangeServer(4000, { abortAt: { call: 3, controller: ac } }))
    await expect(
      downloadChunked('rec', 13, 'https://x/y.mp3', { chunkSize: 1000, signal: ac.signal }),
    ).rejects.toThrow()

    const e = (await listDownloaded()).find((x) => x.surah === 13)!
    expect(e.partial).toBe(true)
    expect(e.bytes).toBe(2000)
    expect(e.totalBytes).toBe(4000)
  })

  it('serves audio once the download does finish', async () => {
    vi.stubGlobal('fetch', rangeServer(2000))
    await downloadChunked('rec', 14, 'https://x/y.mp3', { chunkSize: 1000 })
    const blob = await getAudio('rec', 14)
    expect(blob?.size).toBe(2000)
    expect((await listDownloaded()).find((x) => x.surah === 14)?.partial).toBe(false)
  })
})

describe('DownloadQueue', () => {
  const job = (reciterId: string, surah: number, url = `u${surah}`) => ({
    reciterId,
    surah,
    url,
  })

  it('caps concurrency at 3', async () => {
    let started = 0
    let peak = 0
    let inFlight = 0
    const release: Array<() => void> = []
    const q = new DownloadQueue({
      fetcher: () =>
        new Promise<Blob>((resolve) => {
          started++
          inFlight++
          peak = Math.max(peak, inFlight)
          release.push(() => {
            inFlight--
            resolve(new Blob([new Uint8Array(1)]))
          })
        }),
      save: async () => {},
    })

    for (let i = 1; i <= 5; i++) q.enqueue(job('dosari', i))
    await new Promise((r) => setTimeout(r, 0))
    expect(started).toBe(3)
    expect(peak).toBe(3)

    while (release.length) release.shift()!()
    await new Promise((r) => setTimeout(r, 0))
    while (release.length) release.shift()!()
    await q.drain()

    expect(started).toBe(5)
    expect(peak).toBe(3)
  })

  it('stops the queue when the device fills up', async () => {
    const attempted: number[] = []
    const q = new DownloadQueue({
      fetcher: async (j) => {
        attempted.push(j.surah)
        const e = new Error('out of space')
        e.name = 'OutOfSpaceError'
        throw e
      },
      save: async () => {},
      concurrency: 1,
    })
    for (let i = 1; i <= 5; i++) q.enqueue(job('dosari', i))
    await q.drain()
    // Every queued surah would hit the same wall, so it gives up after one
    // rather than reporting five identical failures.
    expect(attempted).toEqual([1])
    expect(q.outOfSpace).toBe(true)
  })

  it('clears the out-of-space state when a download is requested again', async () => {
    let fail = true
    const q = new DownloadQueue({
      fetcher: async () => {
        if (fail) {
          const e = new Error('out of space')
          e.name = 'OutOfSpaceError'
          throw e
        }
        return new Blob([new Uint8Array(1)])
      },
      save: async () => {},
      concurrency: 1,
    })
    q.enqueue(job('dosari', 1))
    await q.drain()
    expect(q.outOfSpace).toBe(true)

    // A full disk is a queue-wide condition, not one surah's fault, so it is
    // never filed against a surah where it would outlive the problem.
    expect(q.state().failed).toEqual({})

    // The listener freed some room and tried again; the warning must go.
    fail = false
    q.enqueue(job('dosari', 2))
    expect(q.outOfSpace).toBe(false)
    await q.drain()
    expect(q.state().failed).toEqual({})
  })

  it('isolates a failure so the queue keeps going', async () => {
    const q = new DownloadQueue({
      fetcher: async (j) => {
        if (j.surah === 1) throw new Error('boom')
        return new Blob([new Uint8Array(1)])
      },
      save: async () => {},
    })
    q.enqueue(job('dosari', 1))
    q.enqueue(job('dosari', 2))
    await q.drain()
    expect(q.state().failed['dosari:1']).toContain('boom')
    expect(q.state().failed['dosari:2']).toBeUndefined()
  })

  it('saves completed downloads against the job that asked for them', async () => {
    const saved: string[] = []
    const q = new DownloadQueue({
      fetcher: async () => new Blob([new Uint8Array(3)]),
      save: async (j) => {
        saved.push(`${j.reciterId}:${j.surah}`)
      },
    })
    q.enqueue(job('burhaji-nabawi', 9))
    await q.drain()
    expect(saved).toEqual(['burhaji-nabawi:9'])
  })

  it('fetches the URL the job carries, not one looked up later', async () => {
    // Regression: the fetcher used to ignore the job's URL and resolve from
    // whichever reciter the UI happened to be showing, so switching reciter
    // mid-download fetched the wrong audio.
    const seen: string[] = []
    const q = new DownloadQueue({
      fetcher: async (j) => {
        seen.push(j.url)
        return new Blob([new Uint8Array(1)])
      },
      save: async () => {},
    })
    q.enqueue(job('dosari', 2, 'https://example.test/d/2.mp3'))
    await q.drain()
    expect(seen).toEqual(['https://example.test/d/2.mp3'])
  })

  it('keeps the same surah separate across reciters', async () => {
    // Regression: jobs were deduped by surah alone, so one reciter's surah 2
    // silently blocked the other's.
    const saved: string[] = []
    const q = new DownloadQueue({
      fetcher: async () => new Blob([new Uint8Array(1)]),
      save: async (j) => {
        saved.push(`${j.reciterId}:${j.surah}`)
      },
    })
    q.enqueue(job('dosari', 2))
    q.enqueue(job('burhaji-nabawi', 2))
    await q.drain()
    expect(saved.sort()).toEqual(['burhaji-nabawi:2', 'dosari:2'])
  })

  it('ignores a duplicate enqueue of the same job', async () => {
    let calls = 0
    const q = new DownloadQueue({
      fetcher: async () => {
        calls++
        return new Blob([new Uint8Array(1)])
      },
      save: async () => {},
    })
    q.enqueue(job('dosari', 5))
    q.enqueue(job('dosari', 5))
    await q.drain()
    expect(calls).toBe(1)
  })
})

describe('quota gate', () => {
  it('requires 1.25x headroom', () => {
    expect(canDownloadAll(1_000_000_000, 1_300_000_000)).toBe(true)
    expect(canDownloadAll(1_000_000_000, 1_200_000_000)).toBe(false)
  })
})

describe('play queue', () => {
  const available = [1, 2, 3, 18, 36, 37]
  it('advances, skipping gaps', () => {
    expect(nextSurah(3, 'off', available)).toBe(18)
  })
  it('repeat-one stays put', () => {
    expect(nextSurah(18, 'one', available)).toBe(18)
  })
  it('stops at the end when repeat is off', () => {
    expect(nextSurah(37, 'off', available)).toBeNull()
  })
  it('repeat-all wraps', () => {
    expect(nextSurah(37, 'all', available)).toBe(1)
  })
  it('walks backwards', () => {
    expect(prevSurah(18, available)).toBe(3)
    expect(prevSurah(1, available)).toBeNull()
  })
})

describe('formatting', () => {
  it('formats sizes', () => {
    expect(formatBytes(0)).toBe('—')
    expect(formatBytes(228_582_855)).toBe('218 MB')
    expect(formatBytes(1_985_000_000)).toBe('1.85 GB')
  })
  it('formats durations', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(3725)).toBe('1:02:05')
  })
})

describe('sources', () => {
  it('splits matched from unmatched imports', async () => {
    const f = (n: string) => new File([new Uint8Array(2)], n)
    const r = await importFiles([f('018.mp3'), f('Al-Kahf.mp3'), f('mystery.mp3')])
    expect(r.matched.map((m) => m.surah)).toEqual([18, 18])
    expect(r.unmatched.map((u) => u.name)).toEqual(['mystery.mp3'])
  })

  it('handles a realistic mixed batch without guessing', async () => {
    const f = (n: string) => new File([new Uint8Array(2)], n)
    const r = await importFiles([
      f('001.mp3'),
      f('36.m4a'),
      f('الكهف.mp3'),
      f('01 - Al-Fatiha.mp3'),
      f('recording_final_v2.mp3'),
      f('track05.mp3'),
    ])
    expect(r.matched.map((m) => m.surah).sort((a, b) => a - b)).toEqual([1, 1, 18, 36])
    // Anything ambiguous is handed back for manual assignment rather than
    // filed under a guessed surah.
    expect(r.unmatched.map((u) => u.name).sort()).toEqual([
      'recording_final_v2.mp3',
      'track05.mp3',
    ])
  })

  it('refuses a host verified to send no CORS header', async () => {
    const src = new CatalogSource('dosari', new Map([[2, 'https://media.altilawat.com/x.mp3']]))
    await expect(
      src.fetchSurah(2, () => {}, new AbortController().signal),
    ).rejects.toThrow(/CORS-blocked/)
  })

  it('allows the proxy that exists to supply CORS', async () => {
    // Regression: the guard was an allowlist naming only archive.org, so once
    // audio moved behind the Worker every download was refused.
    const url = 'https://mushaf-audio.mushaftarteel.workers.dev/d/1.mp3'
    const src = new CatalogSource('dosari', new Map([[1, url]]))
    let requested: string | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string) => {
        requested = u
        return {
          ok: true,
          status: 206,
          headers: { get: () => 'bytes 0-1/2' },
          arrayBuffer: async () => new Uint8Array(2).buffer,
        }
      }),
    )
    await src.fetchSurah(1, () => {}, new AbortController().signal)
    expect(requested).toBe(url)
    vi.unstubAllGlobals()
  })

  it('reports an unreleased surah clearly', async () => {
    const src = new CatalogSource('dosari', new Map())
    await expect(
      src.fetchSurah(99, () => {}, new AbortController().signal),
    ).rejects.toThrow(/not released/)
  })
})
