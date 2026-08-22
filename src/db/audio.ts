import { getDB } from './index'
import {
  assembleBlob,
  deleteDownload,
  dlKey,
  getManifest,
  listManifests,
} from './downloads'

/**
 * Whole-file records: one ArrayBuffer plus its mime type. Blob storage in
 * IndexedDB has a long history of breaking on iOS Safari and does not
 * reliably survive structured cloning, so a raw buffer is kept and the Blob
 * rebuilt on read.
 *
 * Catalog downloads no longer come through here — they arrive in chunks — but
 * imported files do, and surahs saved by earlier builds are still read from
 * here so they keep playing.
 */
type AudioRecord = {
  buffer: ArrayBuffer
  type: string
  bytes: number
  sourceId: string
  storedAt: number
}

/** Audio is keyed per reciter, so two reciters' copies of a surah coexist. */
const key = (reciterId: string, surah: number) => `${reciterId}:${surah}`

/** Store audio supplied by the user, which arrives whole rather than in parts. */
export async function putAudio(
  reciterId: string,
  surah: number,
  blob: Blob,
  sourceId: string,
) {
  const db = await getDB()
  const buffer = await blob.arrayBuffer()
  const rec: AudioRecord = {
    buffer,
    type: blob.type || 'audio/mpeg',
    bytes: buffer.byteLength,
    sourceId,
    storedAt: Date.now(),
  }
  await db.put('audio', rec, key(reciterId, surah))
}

export async function getAudio(reciterId: string, surah: number): Promise<Blob | null> {
  // A completed chunked download is the normal case now.
  const m = await getManifest(dlKey(reciterId, surah))
  if (m?.state === 'complete') {
    const blob = await assembleBlob(m)
    if (blob) return blob
  }

  const db = await getDB()
  let rec = (await db.get('audio', key(reciterId, surah))) as AudioRecord | undefined
  // Builds before multi-reciter stored Al-Dosari audio under a bare number.
  if (!rec && reciterId === 'dosari') {
    rec = (await db.get('audio', surah)) as AudioRecord | undefined
  }
  if (!rec?.buffer) return null
  return new Blob([rec.buffer], { type: rec.type })
}

export async function deleteAudio(reciterId: string, surah: number) {
  const db = await getDB()
  await deleteDownload(dlKey(reciterId, surah))
  await db.delete('audio', key(reciterId, surah))
  if (reciterId === 'dosari') await db.delete('audio', surah)
}

export type SavedEntry = {
  reciterId: string
  surah: number
  bytes: number
  sourceId: string
  /** A download that stopped part way and can be continued. */
  partial?: boolean
  totalBytes?: number
}

export async function listDownloaded(): Promise<SavedEntry[]> {
  const db = await getDB()
  const out: SavedEntry[] = []
  const seen = new Set<string>()

  for (const m of await listManifests()) {
    seen.add(m.key)
    out.push({
      reciterId: m.reciterId,
      surah: m.surah,
      bytes: m.bytesWritten,
      sourceId: 'catalog',
      partial: m.state !== 'complete',
      totalBytes: m.totalBytes,
    })
  }

  const keys = await db.getAllKeys('audio')
  const vals = (await db.getAll('audio')) as AudioRecord[]
  keys.forEach((k, i) => {
    const raw = String(k)
    if (seen.has(raw)) return
    const [reciterId, surah] = raw.includes(':')
      ? [raw.split(':')[0], Number(raw.split(':')[1])]
      : ['dosari', Number(raw)]
    out.push({
      reciterId,
      surah,
      bytes: vals[i]?.bytes ?? 0,
      sourceId: vals[i]?.sourceId ?? 'unknown',
    })
  })

  return out
}

/**
 * One-time cleanup of audio saved before the download queue was fixed.
 *
 * Until 2026-08-18 the queue resolved a job's URL and its reciter from
 * whatever the UI was showing at the moment the download ran, not from the
 * job itself. Switching reciter with downloads queued therefore stored one
 * reciter's audio under another's key — and because playback prefers a saved
 * copy over streaming, the wrong surah keeps playing even after the code was
 * fixed. Nothing in the record says which entries are affected, so every
 * entry written before the fix is removed and can be saved again from a
 * source that is now correct.
 */
export const QUEUE_FIX_AT = Date.parse('2026-08-18T21:20:00Z')

export async function purgeSuspectAudio(before = QUEUE_FIX_AT): Promise<number> {
  const db = await getDB()
  const keys = await db.getAllKeys('audio')
  const vals = (await db.getAll('audio')) as AudioRecord[]

  let removed = 0
  for (let i = 0; i < keys.length; i++) {
    const rec = vals[i]
    // A record with no timestamp predates the field, so it is also suspect.
    if (!rec?.storedAt || rec.storedAt < before) {
      await db.delete('audio', keys[i])
      removed++
    }
  }
  return removed
}
