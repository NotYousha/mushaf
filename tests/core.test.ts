import { describe, it, expect, vi, beforeEach } from 'vitest'
import { putAudio, getAudio, deleteAudio, listDownloaded } from '../src/db/audio'
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
    expect(v.find((s) => s.surah === 18)!.released).toBe(true)
    expect(v.find((s) => s.surah === 67)!.released).toBe(false)
    expect(v.find((s) => s.surah === 67)!.url).toBeNull()
  })

  it('falls back to bundled data when the remote refresh fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const rs = await loadCatalog('https://example.com/catalog.json')
    expect(rs.find((r) => r.id === 'dosari')!.surahs).toHaveLength(37)
    vi.unstubAllGlobals()
  })

  it('refuses a remote catalog that would remove surahs', async () => {
    const truncated = {
      ...catalog,
      reciters: catalog.reciters.map((r) => ({ ...r, surahs: r.surahs.slice(0, 5) })),
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => truncated }))
    const rs = await loadCatalog('https://example.com/catalog.json')
    expect(rs.find((r) => r.id === 'dosari')!.surahs).toHaveLength(37)
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
                  surah: 38,
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
    expect(rs.find((r) => r.id === 'dosari')!.surahs).toHaveLength(38)
    vi.unstubAllGlobals()
  })

  it('keeps each reciter separate', async () => {
    const rs = await loadCatalog()
    expect(rs.find((r) => r.id === 'burhaji-nabawi')!.surahs).toHaveLength(114)
    expect(rs.find((r) => r.id === 'dosari')!.surahs).toHaveLength(37)
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

function rangeServer(total: number, failAt?: number) {
  let calls = 0
  return vi.fn(async (_url: string, init: RequestInit) => {
    calls++
    if (failAt && calls === failAt) throw new Error('network')
    const header = (init.headers as Record<string, string>).Range
    const m = /bytes=(\d+)-(\d+)/.exec(header)!
    const start = +m[1]
    const end = Math.min(+m[2], total - 1)
    const body = new Uint8Array(Math.max(0, end - start + 1)).fill(7)
    return {
      ok: true,
      status: 206,
      headers: {
        get: (h: string) =>
          h.toLowerCase() === 'content-range' ? `bytes ${start}-${end}/${total}` : null,
      },
      arrayBuffer: async () => body.buffer,
    }
  })
}

describe('downloadChunked', () => {
  it('assembles a file from chunks', async () => {
    vi.stubGlobal('fetch', rangeServer(2500))
    expect((await downloadChunked('https://x/y.mp3', { chunkSize: 1000 })).size).toBe(2500)
    vi.unstubAllGlobals()
  })

  it('reports progress to completion', async () => {
    vi.stubGlobal('fetch', rangeServer(3000))
    const seen: number[] = []
    await downloadChunked('https://x/y.mp3', { chunkSize: 1000, onProgress: (l) => seen.push(l) })
    expect(seen.at(-1)).toBe(3000)
    vi.unstubAllGlobals()
  })

  it('throws rather than returning a short file', async () => {
    vi.stubGlobal('fetch', rangeServer(3000, 2))
    await expect(downloadChunked('https://x/y.mp3', { chunkSize: 1000 })).rejects.toThrow('network')
    vi.unstubAllGlobals()
  })
})

describe('DownloadQueue', () => {
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
          // Every job releases itself, including the ones that only start
          // once an earlier slot frees up.
          release.push(() => {
            inFlight--
            resolve(new Blob([new Uint8Array(1)]))
          })
        }),
      save: async () => {},
    })

    for (let i = 1; i <= 5; i++) q.enqueue(i, `u${i}`)
    await new Promise((r) => setTimeout(r, 0))
    expect(started).toBe(3)
    expect(peak).toBe(3)

    // Drain by repeatedly releasing whatever is currently in flight.
    while (release.length) release.shift()!()
    await new Promise((r) => setTimeout(r, 0))
    while (release.length) release.shift()!()
    await q.drain()

    expect(started).toBe(5)
    expect(peak).toBe(3)
  })

  it('isolates a failure so the queue keeps going', async () => {
    const q = new DownloadQueue({
      fetcher: async (surah) => {
        if (surah === 1) throw new Error('boom')
        return new Blob([new Uint8Array(1)])
      },
      save: async () => {},
    })
    q.enqueue(1, 'a')
    q.enqueue(2, 'b')
    await q.drain()
    expect(q.state().failed[1]).toContain('boom')
    expect(q.state().failed[2]).toBeUndefined()
  })

  it('saves completed downloads', async () => {
    const saved: number[] = []
    const q = new DownloadQueue({
      fetcher: async () => new Blob([new Uint8Array(3)]),
      save: async (surah) => {
        saved.push(surah)
      },
    })
    q.enqueue(9, 'u')
    await q.drain()
    expect(saved).toEqual([9])
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

  it('refuses a CORS-blocked host', async () => {
    const src = new CatalogSource(new Map([[2, 'https://media.altilawat.com/x.mp3']]))
    await expect(
      src.fetchSurah(2, () => {}, new AbortController().signal),
    ).rejects.toThrow(/CORS-blocked/)
  })

  it('reports an unreleased surah clearly', async () => {
    const src = new CatalogSource(new Map())
    await expect(
      src.fetchSurah(99, () => {}, new AbortController().signal),
    ).rejects.toThrow(/not released/)
  })
})
