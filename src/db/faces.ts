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

/**
 * The two places a portrait appears, framed separately.
 *
 * The player draws a large circle and the dock a small square, and a crop
 * that suits one rarely suits the other — a circle cuts the corners off, and
 * what reads as a portrait at 5.4rem is just a smudge at 2.6rem. So each
 * surface keeps its own framing rather than sharing one compromise.
 */
export type Surface = 'player' | 'card'
export const SURFACES: Surface[] = ['player', 'card']

export type Framings = Record<Surface, Framing>
export type Face = { url: string } & Framings

type FaceRecord = {
  buffer: ArrayBuffer
  type: string
  storedAt: number
  frames?: Partial<Framings>
  /** Framing from before the two surfaces were separate. */
  zoom?: number
  x?: number
  y?: number
}

export const DEFAULT_FRAMING: Framing = { zoom: 100, x: 50, y: 50 }
export const DEFAULT_FRAMINGS: Framings = {
  player: { ...DEFAULT_FRAMING },
  card: { ...DEFAULT_FRAMING },
}

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
      /**
       * Decoded straight to the size we want, never at full resolution.
       *
       * This is the difference between a portrait importing and the tab dying.
       * A modern phone camera makes 12 to 48 megapixels; decoded whole that is
       * two hundred megabytes to nearly a gigabyte of bitmap, and Android kills
       * the renderer rather than let a page hold it — which blanks the screen
       * with no error to catch, after the photo has already been saved.
       * Asking the decoder for a smaller image caps it at a few megabytes.
       */
      const bitmap = await createImageBitmap(file, {
        resizeWidth: MAX_EDGE,
        resizeQuality: 'high',
      })
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

    // Let the decoded picture and the canvas go before the write, rather than
    // holding all three at once on a device already short of memory.
    release()
    canvas.width = 0
    canvas.height = 0
    return { buffer: await blob.arrayBuffer(), type: blob.type || 'image/jpeg' }
  } finally {
    // Safe to call twice; the early release above is the one that matters.
    try {
      release()
    } catch {
      /* already released */
    }
  }
}

export async function putFace(imamId: string, file: File): Promise<void> {
  const { buffer, type } = await shrink(file)
  const db = await getDB()
  // A replacement is a new picture, so both surfaces start from a clean frame.
  const rec: FaceRecord = {
    buffer,
    type,
    storedAt: Date.now(),
    frames: { player: { ...DEFAULT_FRAMING }, card: { ...DEFAULT_FRAMING } },
  }
  await db.put('faces', rec, imamId)
}

/** Move or zoom one surface without touching the picture or the other. */
export async function setFraming(
  imamId: string,
  surface: Surface,
  framing: Framing,
): Promise<void> {
  const db = await getDB()
  const rec = (await db.get('faces', imamId)) as FaceRecord | undefined
  if (!rec) return
  await db.put(
    'faces',
    { ...rec, frames: { ...framingsOf(rec), [surface]: framing } },
    imamId,
  )
}

/**
 * A record's framings, whichever shape it was written in.
 *
 * Portraits saved before the surfaces were separate carry one flat framing;
 * it becomes the starting point for both rather than being discarded.
 */
function framingsOf(rec: FaceRecord): Framings {
  const legacy: Framing = {
    zoom: rec.zoom ?? DEFAULT_FRAMING.zoom,
    x: rec.x ?? DEFAULT_FRAMING.x,
    y: rec.y ?? DEFAULT_FRAMING.y,
  }
  return {
    player: rec.frames?.player ?? legacy,
    card: rec.frames?.card ?? legacy,
  }
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
          ...framingsOf(rec),
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

/* ---------------- moving portraits between devices ---------------- */

/**
 * Everything stored, as one portable file.
 *
 * Browser storage is per device and per browser: a photograph added on a phone
 * is on that phone and nowhere else, and no amount of reinstalling changes
 * that. This is the way across — export on one device, import on the other.
 *
 * The pictures are base64 inside JSON rather than a zip so the whole thing is
 * one file with no library, small enough to send over a chat, and readable
 * enough to be bundled into the app later if these should ship for everyone.
 */
export type FaceExport = {
  kind: 'mushaf-faces'
  version: 1
  saved: string
  faces: Record<string, { type: string; data: string; frames: Framings }>
}

const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf)
  let s = ''
  // Chunked: a single spread of a megabyte-long array overflows the stack.
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(s)
}

const fromBase64 = (b64: string) => {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

export async function exportFaces(): Promise<FaceExport> {
  const db = await getDB()
  const keys = await db.getAllKeys('faces')
  const vals = (await db.getAll('faces')) as FaceRecord[]
  const faces: FaceExport['faces'] = {}
  keys.forEach((k, i) => {
    const rec = vals[i]
    if (!rec?.buffer) return
    faces[String(k)] = {
      type: rec.type,
      data: toBase64(rec.buffer),
      frames: framingsOf(rec),
    }
  })
  return {
    kind: 'mushaf-faces',
    version: 1,
    saved: new Date().toISOString().slice(0, 16).replace('T', ' '),
    faces,
  }
}

/** Returns how many were taken in. Anything unrecognisable is refused whole. */
export async function importFaces(text: string): Promise<number> {
  let doc: FaceExport
  try {
    doc = JSON.parse(text)
  } catch {
    throw new Error('That file is not readable.')
  }
  if (doc?.kind !== 'mushaf-faces' || !doc.faces) {
    throw new Error('That is not a portraits file from this app.')
  }
  const db = await getDB()
  let n = 0
  for (const [id, f] of Object.entries(doc.faces)) {
    if (!f?.data) continue
    const rec: FaceRecord = {
      buffer: fromBase64(f.data),
      type: f.type || 'image/webp',
      storedAt: Date.now(),
      frames: f.frames ?? DEFAULT_FRAMINGS,
    }
    await db.put('faces', rec, id)
    n++
  }
  return n
}

/**
 * Drop every portrait the listener added, falling back to the bundled ones.
 *
 * Photographs added by hand take precedence over the ones that ship with the
 * app, which is right while the app has none — and wrong the moment it does.
 * A picture attached to the wrong imam then keeps showing under a correct
 * name, and the only clue is that the app disagrees with itself.
 */
export async function clearFaces(): Promise<number> {
  const db = await getDB()
  const keys = await db.getAllKeys('faces')
  await db.clear('faces')
  return keys.length
}
