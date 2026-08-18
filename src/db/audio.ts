import { getDB } from './index'

/**
 * Audio is stored as an ArrayBuffer plus its mime type, not as a Blob.
 * Blob storage in IndexedDB has a long history of breaking on iOS Safari and
 * does not reliably survive structured cloning. A raw buffer round-trips
 * everywhere; the Blob is rebuilt on read.
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
  await db.delete('audio', key(reciterId, surah))
  if (reciterId === 'dosari') await db.delete('audio', surah)
}

export async function listDownloaded() {
  const db = await getDB()
  const keys = await db.getAllKeys('audio')
  const vals = (await db.getAll('audio')) as AudioRecord[]
  return keys.map((k, i) => {
    const raw = String(k)
    const [reciterId, surah] = raw.includes(':')
      ? [raw.split(':')[0], Number(raw.split(':')[1])]
      : ['dosari', Number(raw)]
    return {
      reciterId,
      surah,
      bytes: vals[i]?.bytes ?? 0,
      sourceId: vals[i]?.sourceId ?? 'unknown',
    }
  })
}
