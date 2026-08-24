import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDB } from '../src/db/index'
import { allImams } from '../src/catalog/mosques'

beforeEach(async () => {
  const db = await getDB()
  if (db.objectStoreNames.contains('faces')) await db.clear('faces')
})

describe('the faces store', () => {
  it('exists at the current schema version', async () => {
    const db = await getDB()
    expect(db.objectStoreNames.contains('faces')).toBe(true)
    // Bumped for this store; the older stores must survive the upgrade.
    expect(db.version).toBeGreaterThanOrEqual(4)
    for (const s of ['audio', 'prefs', 'downloads', 'chunks', 'stumbles', 'pages']) {
      expect(db.objectStoreNames.contains(s), s).toBe(true)
    }
  })

  // Stored as a raw ArrayBuffer for the same reason audio is: Blob storage in
  // IndexedDB has a long history of breaking on iOS Safari.
  it('round-trips a portrait as a buffer, keyed by imam', async () => {
    const db = await getDB()
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer
    await db.put('faces', { buffer, type: 'image/webp', storedAt: 1 }, 'sudais')
    const rec = (await db.get('faces', 'sudais')) as { buffer: ArrayBuffer; type: string }
    expect(rec.type).toBe('image/webp')
    expect(new Uint8Array(rec.buffer)).toEqual(new Uint8Array([1, 2, 3, 4]))
    await db.delete('faces', 'sudais')
    expect(await db.get('faces', 'sudais')).toBeUndefined()
  })
})

describe('the imam roster the settings list is built from', () => {
  const roster = allImams()

  it('lists everyone who leads a published year, with an id', () => {
    expect(roster.length).toBeGreaterThan(10)
    for (const i of roster) {
      expect(i.id, i.nameEn).toBeTruthy()
      expect(i.name.trim().length).toBeGreaterThan(0)
      expect(i.nameEn.trim().length).toBeGreaterThan(0)
      expect(i.serves.length, i.id).toBeGreaterThan(0)
    }
    expect(new Set(roster.map((i) => i.id)).size).toBe(roster.length)
  })

  /**
   * Ordered by how much each actually recites, so a settings list asks first
   * for the faces a listener meets most rather than for a man who led one
   * night in 1418.
   */
  it('puts the most-heard reciters first', () => {
    const top = roster.slice(0, 7).map((i) => i.id)
    // The seven Makkah imams of 1446/1447 are the only ones with surah-level
    // attribution, so they carry all the weight.
    for (const id of ['shamsan', 'turki', 'baleela']) {
      expect(top, `${id} should be near the top`).toContain(id)
    }
  })

  it('carries the shipped portrait where there is one', () => {
    const withPhoto = roster.filter((i) => i.photo)
    expect(withPhoto.map((i) => i.id).sort()).toEqual([
      'burhaji',
      'dosari',
      'juhany',
      'turki',
    ])
  })

  it('separates the two mosques', () => {
    const mk = roster.filter((i) => i.serves.includes('makkah'))
    const md = roster.filter((i) => i.serves.includes('madinah'))
    expect(mk.length).toBeGreaterThan(3)
    expect(md.length).toBeGreaterThan(3)
    // The two who genuinely led at both appear in each list.
    for (const id of ['juhany', 'muaiqly']) {
      expect(mk.some((i) => i.id === id), id).toBe(true)
      expect(md.some((i) => i.id === id), id).toBe(true)
    }
  })
})

/**
 * A portrait is a decoration. Reading them happens at boot, so a store that
 * will not open must never take the whole app down with it — which is exactly
 * what a blank screen was.
 */
describe('reading portraits never breaks the app', () => {
  it('returns an empty map rather than throwing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { loadFaces, revokeFaces } = await import('../src/db/faces')
    const faces = await loadFaces()
    expect(faces).toBeInstanceOf(Map)
    // Revoking an empty or missing map is a no-op, never a throw.
    expect(() => revokeFaces(faces)).not.toThrow()
    expect(() => revokeFaces(null)).not.toThrow()
    spy.mockRestore()
  })

  it('defaults the framing of a record saved without one', async () => {
    const { loadFaces, DEFAULT_FRAMING } = await import('../src/db/faces')
    const db = await getDB()
    await db.put('faces', { buffer: new Uint8Array([1]).buffer, type: 'image/webp' }, 'legacy')
    const faces = await loadFaces()
    const f = faces.get('legacy')!
    // Both surfaces start from the default when the record predates them.
    for (const surface of ['player', 'card'] as const) {
      expect(f[surface].zoom).toBe(DEFAULT_FRAMING.zoom)
      expect(f[surface].x).toBe(DEFAULT_FRAMING.x)
      expect(f[surface].y).toBe(DEFAULT_FRAMING.y)
    }
    await db.delete('faces', 'legacy')
  })
})

/**
 * Browser storage is per device and per browser: a photograph added on a phone
 * is on that phone and nowhere else. A portable file is the way across, and
 * the same file is what can later be bundled so everyone gets them.
 */
describe('moving portraits between devices', () => {
  it('round-trips a portrait and its framing', async () => {
    const { exportFaces, importFaces, loadFaces, setFraming } = await import(
      '../src/db/faces'
    )
    const db = await getDB()
    await db.put(
      'faces',
      { buffer: new Uint8Array([9, 8, 7, 6]).buffer, type: 'image/webp', storedAt: 1 },
      'sudais',
    )
    await setFraming('sudais', 'card', { zoom: 180, x: 30, y: 20 })

    const doc = await exportFaces()
    expect(doc.kind).toBe('mushaf-faces')
    expect(Object.keys(doc.faces)).toContain('sudais')

    await db.clear('faces')
    expect((await loadFaces()).size).toBe(0)

    const n = await importFaces(JSON.stringify(doc))
    expect(n).toBe(1)

    const back = (await db.get('faces', 'sudais')) as {
      buffer: ArrayBuffer
      frames: { card: { zoom: number; x: number; y: number } }
    }
    expect(new Uint8Array(back.buffer)).toEqual(new Uint8Array([9, 8, 7, 6]))
    expect(back.frames.card).toEqual({ zoom: 180, x: 30, y: 20 })
    await db.clear('faces')
  })

  it('refuses a file that is not ours, rather than half-importing it', async () => {
    const { importFaces } = await import('../src/db/faces')
    await expect(importFaces('not json at all')).rejects.toThrow(/readable/i)
    await expect(importFaces(JSON.stringify({ kind: 'something-else' }))).rejects.toThrow(
      /portraits file/i,
    )
  })
})
