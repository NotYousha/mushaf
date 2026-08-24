import { getDB } from './index'

/**
 * Portraits the listener supplies for individual imams.
 *
 * A Taraweeh year is recited by several imams, and the app ships a photograph
 * for only a handful of them. Rather than bundle pictures of people we have no
 * rights to, the listener adds their own and they live on the device.
 *
 * The picture is kept whole, with the framing stored beside it, rather than
 * being cropped on the way in. A face is rarely dead centre in a photograph,
 * and a centred crop cannot be undone — so the crop stays a setting the
 * listener can come back and change.
 *
 * Stored as a raw ArrayBuffer rather than a Blob, for the same reason
 * db/audio.ts does: Blob storage in IndexedDB has a long history of breaking
 * on iOS Safari and does not reliably survive structured cloning.
 */
export type Framing = {
  /** Percentage passed to background-size; 100 fits the shorter edge. */
  zoom: number
  /** Percentages passed to background-position. */
  x: number
  y: number
}

export type Face = Framing & { url: string }

type FaceRecord = Framing & {
  buffer: ArrayBuffer
  type: string
  storedAt: number
}

export const DEFAULT_FRAMING: Framing = { zoom: 100, x: 50, y: 50 }

/** Long edge after shrinking. Three times the medallion at 3x, which is
 *  enough to stay sharp while zoomed in and still land well under a
 *  megabyte. */
const MAX_EDGE = 720
/** A guard against a 40 MP photograph being decoded on a cheap phone. */
const MAX_SOURCE_BYTES = 32 * 1024 * 1024

export class ImageTooLargeError extends Error {
  constructor() {
    super('That photo is too large. Try one under 32 MB.')
    this.name = 'ImageTooLargeError'
  }
}

export class ImageUnreadableError extends Error {
  constructor(detail?: string) {
    super(
      detail
        ? `That image could not be read (${detail}).`
        : 'That image could not be read. A JPEG or PNG works best.',
    )
    this.name = 'ImageUnreadableError'
  }
}

/**
 * Decode a picked file to something drawable.
 *
 * `createImageBitmap` is the direct route but it is not everywhere, and it
 * rejects outright on formats the browser will nonetheless render — an iPhone
 * HEIC being the one that matters. Falling back to an <img> means anything the
 * browser can display can be imported, which is the promise the file picker's
 * `accept="image/*"` makes.
 */
async function decode(file: File): Promise<{
  draw: CanvasImageSource
  width: number
  height: number
  release: () => void
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        draw: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }
    } catch {
      /* fall through to the <img> path */
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new ImageUnreadableError())
      el.src = url
    })
    return {
      draw: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e instanceof Error ? e : new ImageUnreadableError()
  }
}

/** Shrink to MAX_EDGE, keeping the aspect ratio so framing still has room. */
async function shrink(file: File): Promise<{ buffer: ArrayBuffer; type: string }> {
  if (file.size > MAX_SOURCE_BYTES) throw new ImageTooLargeError()

  const { draw, width, height, release } = await decode(file)
  try {
    if (!width || !height) throw new ImageUnreadableError('no dimensions')
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new ImageUnreadableError('no canvas')
    ctx.drawImage(draw, 0, 0, canvas.width, canvas.height)

    // WebP first for the size, JPEG where the browser cannot encode it —
    // Safari could not until fairly recently and returns null rather than
    // failing loudly.
    const blob =
      (await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.9))) ??
      (await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9)))
    if (!blob) throw new ImageUnreadableError('could not be re-encoded')
    return { buffer: await blob.arrayBuffer(), type: blob.type || 'image/jpeg' }
  } finally {
    release()
  }
}

export async function putFace(imamId: string, file: File): Promise<void> {
  const { buffer, type } = await shrink(file)
  const db = await getDB()
  const existing = (await db.get('faces', imamId)) as FaceRecord | undefined
  const rec: FaceRecord = {
    buffer,
    type,
    // A replacement is a new picture, so it starts from a clean frame.
    ...DEFAULT_FRAMING,
    storedAt: Date.now(),
    ...(existing && file.size === 0 ? { zoom: existing.zoom, x: existing.x, y: existing.y } : {}),
  }
  await db.put('faces', rec, imamId)
}

/** Move or zoom an existing portrait without touching the picture itself. */
export async function setFraming(imamId: string, framing: Framing): Promise<void> {
  const db = await getDB()
  const rec = (await db.get('faces', imamId)) as FaceRecord | undefined
  if (!rec) return
  await db.put('faces', { ...rec, ...framing }, imamId)
}

export async function deleteFace(imamId: string): Promise<void> {
  const db = await getDB()
  await db.delete('faces', imamId)
}

/**
 * Every stored portrait, as object URLs keyed by imam.
 *
 * Read once and held, rather than per render: the player re-renders about four
 * times a second while playing, and a URL made per render would leak one every
 * time. The caller owns these and must pass them to revokeFaces when replacing
 * the map.
 */
export async function loadFaces(): Promise<Map<string, Face>> {
  const out = new Map<string, Face>()
  try {
    const db = await getDB()
    if (!db.objectStoreNames.contains('faces')) return out
    const keys = await db.getAllKeys('faces')
    const vals = (await db.getAll('faces')) as FaceRecord[]
    keys.forEach((k, i) => {
      const rec = vals[i]
      if (!rec?.buffer) return
      try {
        out.set(String(k), {
          url: URL.createObjectURL(new Blob([rec.buffer], { type: rec.type })),
          // A record written before framing existed carries none.
          zoom: rec.zoom ?? DEFAULT_FRAMING.zoom,
          x: rec.x ?? DEFAULT_FRAMING.x,
          y: rec.y ?? DEFAULT_FRAMING.y,
        })
      } catch (e) {
        // One unreadable portrait must not cost the others.
        console.error(`could not read the portrait for ${String(k)}:`, e)
      }
    })
  } catch (e) {
    // A portrait is a decoration. Never let one stop the app from opening —
    // this runs at boot, and a database that will not open here would
    // otherwise take the whole mushaf down with it.
    console.error('could not read stored portraits:', e)
  }
  return out
}

export function revokeFaces(faces: Map<string, Face> | null | undefined) {
  if (!faces) return
  for (const f of faces.values()) URL.revokeObjectURL(f.url)
}
