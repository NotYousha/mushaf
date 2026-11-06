import { describe, it, expect } from 'vitest'
import { DownloadQueue, type Job } from '../src/download/queue'

const job = (reciterId: string, surah: number): Job => ({ reciterId, surah, url: `https://x/${surah}.mp3` })

/** A fetcher whose downloads finish when told to, and honour abort. */
function controllable() {
  const started: string[] = []
  const finish = new Map<string, () => void>()
  const fetcher = (j: Job, _p: unknown, signal: AbortSignal) =>
    new Promise<Blob>((resolve, reject) => {
      const k = `${j.reciterId}:${j.surah}`
      started.push(k)
      finish.set(k, () => resolve(new Blob([new Uint8Array(1)])))
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })
  return { started, finish, fetcher }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('pausing downloads', () => {
  it('keeps the surahs that were in flight, and resumes them first', async () => {
    const c = controllable()
    const saved: number[] = []
    const q = new DownloadQueue({ fetcher: c.fetcher, save: async (j) => void saved.push(j.surah), concurrency: 2 })
    for (let i = 1; i <= 4; i++) q.enqueue(job('dosari', i))
    expect(c.started).toEqual(['dosari:1', 'dosari:2'])

    q.pauseAll()
    await tick()
    const s = q.state()
    expect(s.paused).toBe(true)
    expect(s.active).toEqual([])
    // Nothing lost: the two that were running wait at the front of the line.
    expect(s.pending).toEqual(['dosari:1', 'dosari:2', 'dosari:3', 'dosari:4'])
    expect(s.failed).toEqual({})

    q.resumeAll()
    expect(c.started.slice(2)).toEqual(['dosari:1', 'dosari:2'])
    c.finish.get('dosari:1')!()
    c.finish.get('dosari:2')!()
    await tick()
    await tick()
    c.finish.get('dosari:3')!()
    c.finish.get('dosari:4')!()
    await q.drain()
    expect(saved.sort()).toEqual([1, 2, 3, 4])
  })

  it('stops every reciter at once', async () => {
    const c = controllable()
    const q = new DownloadQueue({ fetcher: c.fetcher, save: async () => {}, concurrency: 1 })
    q.enqueue(job('dosari', 1))
    q.enqueue(job('sudais', 2))
    q.enqueue(job('afasy', 3))
    q.cancelAll()
    await q.drain()
    const s = q.state()
    expect(s.active).toEqual([])
    expect(s.pending).toEqual([])
    expect(s.failed).toEqual({})
    expect(s.paused).toBe(false)
  })
})
