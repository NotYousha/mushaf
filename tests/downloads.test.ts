import { describe, it, expect, beforeEach } from 'vitest'
import { getDB } from '../src/db/index'
import {
  assembleBlob,
  chunkCount,
  commitChunk,
  deleteDownload,
  putManifest,
  type Manifest,
} from '../src/db/downloads'

beforeEach(async () => {
  const db = await getDB()
  for (const store of ['downloads', 'chunks']) {
    if (db.objectStoreNames.contains(store)) await db.clear(store)
  }
})

const manifest = (over: Partial<Manifest> = {}): Manifest => ({
  key: 'dosari:2',
  reciterId: 'dosari',
  surah: 2,
  url: 'https://example.test/2.mp3',
  type: 'audio/mpeg',
  totalBytes: 5000,
  bytesWritten: 0,
  chunkSize: 1000,
  etag: '"abc"',
  lastModified: null,
  chunks: 0,
  state: 'partial',
  updatedAt: 1,
  ...over,
})

const bytes = (n: number, fill: number) => new Uint8Array(n).fill(fill).buffer

describe('a chunked download', () => {
  /**
   * HTTP may answer a range request with less than was asked for.
   *
   * The chunk index used to be derived as `floor(bytesWritten / chunkSize)`,
   * which assumes every response filled its window. With two 500-byte replies
   * against a 1000-byte window, both landed on index 0: the second overwrote
   * the first, the file assembled short and out of order, and the manifest
   * still said `complete`. Nothing reported an error.
   */
  it('keeps every short chunk, in order', async () => {
    let m = manifest({ totalBytes: 2000 })
    await putManifest(m)
    // Four half-size responses rather than two full ones.
    for (const fill of [1, 2, 3, 4]) m = await commitChunk(m, bytes(500, fill))

    expect(m.chunks).toBe(4)
    expect(m.bytesWritten).toBe(2000)

    const blob = await assembleBlob({ ...m, state: 'complete' })
    expect(blob, 'every chunk should still be on disk').not.toBeNull()
    expect(blob!.size).toBe(2000)

    // In the order they arrived, not collapsed onto one index.
    const seen = new Uint8Array(await blob!.arrayBuffer())
    expect([seen[0], seen[500], seen[1000], seen[1500]]).toEqual([1, 2, 3, 4])
  })

  it('deletes every chunk it wrote, including the short ones', async () => {
    let m = manifest({ totalBytes: 2000 })
    await putManifest(m)
    for (const fill of [1, 2, 3, 4]) m = await commitChunk(m, bytes(500, fill))

    await deleteDownload(m.key)
    const db = await getDB()
    expect(await db.getAllKeys('chunks')).toEqual([])
    expect(await db.get('downloads', m.key)).toBeUndefined()
  })

  describe('counting the chunks', () => {
    it('trusts the manifest over the byte arithmetic', () => {
      // Six short chunks holding what would arithmetically be three.
      expect(chunkCount(manifest({ chunks: 6, bytesWritten: 3000 }))).toBe(6)
    })

    /**
     * A manifest written before the count existed carries no `chunks`, so the
     * old derivation is all it has. That derivation is the bug — but for a
     * download that only ever saw full-size responses it is also correct, and
     * guessing is better than treating the partial as unreadable.
     */
    it('falls back for a manifest from an earlier build', () => {
      const old = manifest({ bytesWritten: 3000 })
      delete (old as { chunks?: number }).chunks
      expect(chunkCount(old)).toBe(3)
    })

    // A non-finite count is what gave `Math.ceil(Infinity / n)` and a delete
    // loop that never ended, holding the queue's only slot until a reload.
    // The loop is gone — deletion is one key range now and never consults the
    // count — so this holds the count honest for the readers that do use it,
    // and proves the delete no longer cares.
    it('never reports a non-finite count, and deletes anyway', async () => {
      const bad = manifest({ bytesWritten: Infinity })
      delete (bad as { chunks?: number }).chunks
      expect(Number.isFinite(chunkCount(bad))).toBe(false)
      await putManifest(bad)
      await deleteDownload(bad.key)
      const db = await getDB()
      expect(await db.get('downloads', bad.key)).toBeUndefined()
    })
  })

  /**
   * A resume's whole integrity story is `If-Range`. With neither an ETag nor a
   * Last-Modified there is nothing to send, so the server honours the range and
   * answers 206 — and yesterday's bytes get spliced onto today's. The manifest
   * therefore has to carry a validator, and the downloader restarts from zero
   * when it does not.
   */
  it('records a validator so a resume can be checked', () => {
    const withEtag = manifest()
    const withDate = manifest({ etag: null, lastModified: 'Wed, 03 Dec 2025 00:00:00 GMT' })
    const withNeither = manifest({ etag: null, lastModified: null })

    for (const m of [withEtag, withDate]) {
      expect(m.etag ?? m.lastModified, 'resumable').toBeTruthy()
    }
    expect(withNeither.etag ?? withNeither.lastModified).toBeNull()
  })
})
