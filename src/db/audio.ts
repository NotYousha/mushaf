import { getDB } from './index'

/**
 * Audio is stored as an ArrayBuffer plus its mime type, not as a Blob.
 *
 * Blob storage in IndexedDB has a long history of breaking on iOS Safari, and
 * a Blob does not reliably survive structured cloning across engines. A raw
 * buffer round-trips everywhere; the Blob is rebuilt on read.
 */
type AudioRecord = {
  buffer: ArrayBuffer
  type: string
  bytes: number
  sourceId: string
  storedAt: number
}

export async function putAudio(surah: number, blob: Blob, sourceId: string) {
  const db = await getDB()
  const buffer = await blob.arrayBuffer()
  const rec: AudioRecord = {
    buffer,
    type: blob.type || 'audio/mpeg',
    bytes: buffer.byteLength,
    sourceId,
    storedAt: Date.now(),
  }
  await db.put('audio', rec, surah)
}

export async function getAudio(surah: number): Promise<Blob | null> {
  const db = await getDB()
  const rec = (await db.get('audio', surah)) as AudioRecord | undefined
  if (!rec?.buffer) return null
  return new Blob([rec.buffer], { type: rec.type })
}

export async function deleteAudio(surah: number) {
  const db = await getDB()
  await db.delete('audio', surah)
}

export async function listDownloaded() {
  const db = await getDB()
  const keys = await db.getAllKeys('audio')
  const vals = (await db.getAll('audio')) as AudioRecord[]
  return keys.map((k, i) => ({
    surah: Number(k),
    bytes: vals[i]?.bytes ?? 0,
    sourceId: vals[i]?.sourceId ?? 'unknown',
  }))
}
