import { describe, it, expect, beforeEach } from 'vitest'
import { getDB } from '../src/db/index'
import { putAudio, purgeSuspectAudio, listDownloaded } from '../src/db/audio'
import { DownloadQueue } from '../src/download/queue'

async function wipe() {
  const db = await getDB()
  for (const store of ['audio', 'downloads', 'chunks']) {
    if (db.objectStoreNames.contains(store)) await db.clear(store)
  }
}

beforeEach(wipe)

/**
 * The purge repairs audio misfiled by the download queue before 2026-08-18.
 * An imported recording was never misfiled by it, and deleting one destroys
 * something that cannot be fetched again — it came off the listener's device.
 */
describe('the one-time purge', () => {
  it('never deletes the listener.s own imports', async () => {
    await putAudio('dosari', 5, new Blob([new Uint8Array([1, 2, 3])]), 'import')
    const db = await getDB()
    // Backdate it well before the cutoff, which is what made it vulnerable.
    const rec = await db.get('audio', 'dosari:5')
    await db.put('audio', { ...rec, storedAt: 1 }, 'dosari:5')

    const removed = await purgeSuspectAudio()

    expect(removed).toBe(0)
    expect(await db.get('audio', 'dosari:5')).toBeTruthy()
    expect((await listDownloaded()).some((e) => e.sourceId === 'import')).toBe(true)
  })

  it('still clears suspect catalog audio', async () => {
    await putAudio('dosari', 6, new Blob([new Uint8Array([1])]), 'catalog')
    const db = await getDB()
    const rec = await db.get('audio', 'dosari:6')
    await db.put('audio', { ...rec, storedAt: 1 }, 'dosari:6')

    expect(await purgeSuspectAudio()).toBe(1)
    expect(await db.get('audio', 'dosari:6')).toBeUndefined()
  })
})

describe('the download queue', () => {
  /**
   * Cancelling is not a failure. Filing it as one left "could not save: the
   * user aborted a request" on screen for good: the failed map is only ever
   * cleared by re-enqueueing that exact surah, so it re-asserted itself on
   * every later queue event and stomped whatever else the app wanted to say.
   */
  it('does not file a cancellation as a failure', async () => {
    let seen: Record<string, string> = {}
    const q = new DownloadQueue({
      fetcher: (_job, _onProgress, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const e = new Error('The user aborted a request.')
            e.name = 'AbortError'
            reject(e)
          })
        }),
      save: async () => {},
    })
    q.subscribe((s) => {
      seen = s.failed
    })

    q.enqueue({ reciterId: 'dosari', surah: 2, url: 'https://example.test/2.mp3' })
    await new Promise((r) => setTimeout(r, 10))
    q.cancel('dosari', 2)
    await q.drain().catch(() => {})
    await new Promise((r) => setTimeout(r, 10))

    expect(Object.keys(seen)).toHaveLength(0)
  })

  /**
   * A genuine failure must still be reported, or the cancellation fix would
   * have swallowed the thing the message exists for.
   */
  it('still reports a real failure', async () => {
    let seen: Record<string, string> = {}
    const q = new DownloadQueue({
      fetcher: async () => {
        throw new Error('the host returned 500')
      },
      save: async () => {},
    })
    q.subscribe((s) => {
      seen = s.failed
    })

    q.enqueue({ reciterId: 'dosari', surah: 3, url: 'https://example.test/3.mp3' })
    await q.drain().catch(() => {})
    await new Promise((r) => setTimeout(r, 10))

    expect(Object.values(seen).join()).toContain('500')
  })
})

/**
 * The lock screen and the Dynamic Island own the scrubber while a finger is on
 * it. Every setPositionState call re-asserts where the app thinks it is, so
 * reporting on every timeupdate — four times a second — pulls the thumb back
 * out from under the finger and the seek never lands.
 */
describe('position reporting to the OS', () => {
  const el = () =>
    ({ duration: 600, currentTime: 12, playbackRate: 1 }) as unknown as HTMLAudioElement

  it('reports at most once a second while playing', async () => {
    const { setPosition, setSeeking } = await import('../src/player/mediaSession')
    const calls: unknown[] = []
    const session = { setPositionState: (s: unknown) => calls.push(s) }
    ;(navigator as unknown as { mediaSession: unknown }).mediaSession = session
    setSeeking(false)

    setPosition(el(), true)
    const after = calls.length
    // A burst of timeupdates must not become a burst of reports.
    for (let i = 0; i < 8; i++) setPosition(el())
    expect(calls.length).toBe(after)
  })

  it('says nothing at all while a seek is in flight', async () => {
    const { setPosition, setSeeking } = await import('../src/player/mediaSession')
    const calls: unknown[] = []
    ;(navigator as unknown as { mediaSession: unknown }).mediaSession = {
      setPositionState: (s: unknown) => calls.push(s),
    }

    setSeeking(true)
    for (let i = 0; i < 5; i++) setPosition(el())
    expect(calls).toHaveLength(0)

    // Landing reports immediately rather than waiting out the interval.
    setSeeking(false)
    setPosition(el())
    expect(calls).toHaveLength(1)
  })
})
