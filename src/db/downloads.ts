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
export async function commitChunk(
  m: Manifest,
  index: number,
  buf: ArrayBuffer,
): Promise<Manifest> {
  const db = await getDB()
  const next: Manifest = {
    ...m,
    bytesWritten: m.bytesWritten + buf.byteLength,
    updatedAt: Date.now(),
  }
  const tx = db.transaction(['chunks', 'downloads'], 'readwrite')
  void tx.objectStore('chunks').put({ buf }, chunkKey(m.key, index))
  void tx.objectStore('downloads').put(next, m.key)
  await tx.done
  return next
}

/** Rebuild the audio without ever holding the whole file in the JS heap. */
export async function assembleBlob(m: Manifest): Promise<Blob | null> {
  const db = await getDB()
  const count = Math.ceil(m.totalBytes / m.chunkSize)
  // Blob parts are held by reference, so this accumulates without copying
  // every chunk into one large buffer.
  const parts: BlobPart[] = []
  for (let i = 0; i < count; i++) {
    const rec = (await db.get('chunks', chunkKey(m.key, i))) as
      | { buf: ArrayBuffer }
      | undefined
    if (!rec?.buf) return null
    parts.push(rec.buf)
  }
  return new Blob(parts, { type: m.type || 'audio/mpeg' })
}

export async function deleteDownload(key: string, m?: Manifest) {
  const db = await getDB()
  const manifest = m ?? ((await db.get('downloads', key)) as Manifest | undefined)
  if (manifest) {
    const count = Math.ceil(manifest.totalBytes / manifest.chunkSize)
    for (let i = 0; i < count; i++) await db.delete('chunks', chunkKey(key, i))
  }
  // The manifest goes last. A crash mid-delete then leaves a manifest
  // pointing at missing chunks, which resume repairs, rather than orphaned
  // chunks no manifest knows about.
  await db.delete('downloads', key)
}

export async function listManifests(): Promise<Manifest[]> {
  const db = await getDB()
  return (await db.getAll('downloads')) as Manifest[]
}
