import { getDB } from './index'

/**
 * Partial-download bookkeeping.
 *
 * A surah is stored as a sequence of chunk records, never as one growing
 * record. Rewriting a single record as it grows would re-serialise and
 * re-write the whole thing on every chunk — for a 228 MB surah at 2 MB
 * chunks that is roughly 13 GB of disk writes, and each rewrite briefly
 * holds the entire file twice in memory.
 *
 * Chunks are also never merged into one blob at the end. Reading a 228 MB
 * file into an ArrayBuffer and handing it to IndexedDB peaks at several
 * hundred megabytes on a phone that may only have two gigabytes.
 */
export type Manifest = {
  key: string
  reciterId: string
  surah: number
  url: string
  type: string
  totalBytes: number
  /** Bytes proven to be on disk. Never ahead of the chunks themselves. */
  bytesWritten: number
  chunkSize: number
  /** Strong validator, so a resume can prove the file has not changed. */
  etag: string | null
  /**
   * Weak validator, for the hosts that send no ETag.
   *
   * Without either of these a resume cannot prove anything, and `If-Range`
   * simply is not sent — the server honours the range, answers 206, and the
   * bytes already on disk get spliced onto bytes from a different recording.
   * `If-Range` accepts an HTTP-date, so this is the fallback.
   */
  lastModified: string | null
  /**
   * How many chunks are actually on disk.
   *
   * Not derivable from the byte count. HTTP is free to answer a range request
   * with less than was asked for, and the index used to be
   * `floor(bytesWritten / chunkSize)` — so two short responses landed on the
   * same index, one overwrote the other, and the file assembled short and out
   * of order while the manifest said `complete`. This is the authority for how
   * many chunks exist, for writing and for deleting.
   */
  chunks: number
  state: 'partial' | 'complete'
  updatedAt: number
}

export const dlKey = (reciterId: string, surah: number) => `${reciterId}:${surah}`
const chunkKey = (key: string, index: number) => `${key}:${index}`

export async function getManifest(key: string): Promise<Manifest | undefined> {
  const db = await getDB()
  return db.get('downloads', key) as Promise<Manifest | undefined>
}

export async function putManifest(m: Manifest) {
  const db = await getDB()
  await db.put('downloads', { ...m, updatedAt: Date.now() }, m.key)
}

/**
 * Write one chunk and advance the byte count in a single transaction.
 *
 * The atomicity is the whole point: if the write fails for want of space,
 * both the chunk and the counter roll back together, so the manifest can
 * never claim bytes that are not there and a resume can never begin from a
 * hole in the middle of the file.
 */
/**
 * Append one chunk.
 *
 * The index is the manifest's own count, not a number the caller works out
 * from the byte offset — see Manifest.chunks.
 */
export async function commitChunk(m: Manifest, buf: ArrayBuffer): Promise<Manifest> {
  const db = await getDB()
  const index = chunkCount(m)
  const next: Manifest = {
    ...m,
    bytesWritten: m.bytesWritten + buf.byteLength,
    chunks: index + 1,
    updatedAt: Date.now(),
  }
  const tx = db.transaction(['chunks', 'downloads'], 'readwrite')
  void tx.objectStore('chunks').put({ buf }, chunkKey(m.key, index))
  void tx.objectStore('downloads').put(next, m.key)
  await tx.done
  return next
}

/**
 * How many chunks a manifest has, tolerating one written before it counted.
 *
 * A manifest from an earlier build has no `chunks`, so its count has to be
 * derived the old way. That derivation is exactly what was wrong, but for a
 * download that only ever saw full-size responses it is right — and it is the
 * only information those manifests carry.
 */
export const chunkCount = (m: Manifest): number =>
  Number.isFinite(m.chunks)
    ? m.chunks
    : Math.ceil(m.bytesWritten / m.chunkSize)

/**
 * Rebuild the audio, holding one chunk in the JS heap at a time.
 *
 * The old version pushed each chunk's ArrayBuffer into an array and built the
 * Blob at the end. The comment said Blob parts are held by reference, which is
 * true of the Blob — but an ArrayBuffer read back out of IndexedDB is
 * deserialised into the JS heap first, so the array held the entire file live
 * before the Blob copied it again. A 229 MB surah peaked near half a gigabyte,
 * on every play, and twice over during the minute when the next surah is being
 * prepared. Android kills the renderer for that, in the middle of a recitation.
 *
 * Wrapping each chunk as it arrives moves those bytes into blob storage, which
 * is outside the heap and may be backed by disk, and lets the ArrayBuffer be
 * collected before the next one is read. Peak heap is now one chunk — 2 MB —
 * whatever the length of the surah.
 *
 * Deliberately not solved by storing Blobs in the first place: IndexedDB
 * accepts them, but nothing here can prove the round-trip on a real device,
 * and a Blob that came back subtly wrong would assemble a short file and play
 * a truncated recitation with no error. This way the stored format is
 * unchanged, so it also repairs every download already on a phone rather than
 * only the ones fetched from here on.
 */
export async function assembleBlob(m: Manifest): Promise<Blob | null> {
  const db = await getDB()
  const count = chunkCount(m)
  const parts: Blob[] = []
  for (let i = 0; i < count; i++) {
    const rec = (await db.get('chunks', chunkKey(m.key, i))) as
      | { buf: ArrayBuffer }
      | undefined
    if (!rec?.buf) return null
    parts.push(new Blob([rec.buf]))
  }
  return new Blob(parts, { type: m.type || 'audio/mpeg' })
}

export async function deleteDownload(key: string) {
  const db = await getDB()
  /*
   * The chunks go by key range, not one call per chunk.
   *
   * Chunk keys are `${key}:${index}`, so every chunk of a surah sits in one
   * contiguous stretch of the store and a single bound range removes the lot.
   * Deleting a whole mushaf is 114 surahs of fifty-odd chunks each; issuing
   * six thousand separate deletes took long enough to look like a hang, and
   * every one of them was a promise the caller had to await in turn.
   *
   * The range is closed at `:` and open at the character after it, so it can
   * never reach a neighbouring key — `dosari:2` and `dosari:20` are distinct
   * prefixes and must stay that way.
   */
  await db.delete('chunks', IDBKeyRange.bound(`${key}:`, `${key};`, false, true))
  // The manifest goes last. A crash mid-delete then leaves a manifest
  // pointing at missing chunks, which resume repairs, rather than orphaned
  // chunks no manifest knows about.
  await db.delete('downloads', key)
}

export async function listManifests(): Promise<Manifest[]> {
  const db = await getDB()
  return (await db.getAll('downloads')) as Manifest[]
}
