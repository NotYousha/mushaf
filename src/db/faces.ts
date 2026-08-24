import { getDB } from './index'

/**
 * Portraits the listener supplies for individual imams.
 *
 * A Taraweeh year is recited by several imams, and the app ships a photograph
 * for only a handful of them. Rather than bundle pictures of people we have no
 * rights to, the listener adds their own and they live on the device.
 *
 * Stored as a raw ArrayBuffer rather than a Blob, for the same reason
 * db/audio.ts does: Blob storage in IndexedDB has a long history of breaking
 * on iOS Safari and does not reliably survive structured cloning.
 */
type FaceRecord = {
  buffer: ArrayBuffer
  type: string
  storedAt: number
}

/** Square, and no larger than the medallion is ever drawn at 3x. */
const SIDE = 320
/** A guard against a 40 MP phone photo being decoded on a low-end device. */
const MAX_SOURCE_BYTES = 24 * 1024 * 1024

export class ImageTooLargeError extends Error {
  constructor() {
    super('image is too large')
    this.name = 'ImageTooLargeError'
  }
}

/**
 * Crop to a centred square and shrink to SIDE.
 *
 * The medallion is a circle, so anything but a square crop gets stretched by
 * background-size and the face ends up distorted. Doing it once on import
 * rather than on every render also keeps what is stored small: a phone photo
 * is several megabytes, and this lands under a hundred kilobytes.
 */
async function toSquare(file: File): Promise<{ buffer: ArrayBuffer; type: string }> {
  if (file.size > MAX_SOURCE_BYTES) throw new ImageTooLargeError()

  const bitmap = await createImageBitmap(file)
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = SIDE
    canvas.height = SIDE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      SIDE,
      SIDE,
    )
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.9),
    )
    if (!blob) throw new Error('could not encode the image')
    return { buffer: await blob.arrayBuffer(), type: blob.type || 'image/webp' }
  } finally {
    bitmap.close()
  }
}

export async function putFace(imamId: string, file: File): Promise<void> {
  const { buffer, type } = await toSquare(file)
  const db = await getDB()
  await db.put('faces', { buffer, type, storedAt: Date.now() } as FaceRecord, imamId)
}

export async function deleteFace(imamId: string): Promise<void> {
  const db = await getDB()
  await db.delete('faces', imamId)
}

/**
 * Every stored portrait, as object URLs keyed by imam.
 *
 * Read once and held, rather than fetched per render: the player re-renders
 * about four times a second while playing, and creating an object URL per
 * render would leak one every time. The caller owns these and must pass them
 * to revokeFaces when they are replaced.
 */
export async function loadFaces(): Promise<Map<string, string>> {
  const db = await getDB()
  const keys = await db.getAllKeys('faces')
  const vals = (await db.getAll('faces')) as FaceRecord[]
  const out = new Map<string, string>()
  keys.forEach((k, i) => {
    const rec = vals[i]
    if (!rec?.buffer) return
    out.set(String(k), URL.createObjectURL(new Blob([rec.buffer], { type: rec.type })))
  })
  return out
}

export function revokeFaces(urls: Map<string, string> | null | undefined) {
  if (!urls) return
  for (const url of urls.values()) URL.revokeObjectURL(url)
}
