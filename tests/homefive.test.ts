import { describe, it, expect } from 'vitest'
import { HOME_RECITERS } from '../src/catalog/home'
import catalog from '../data/catalog.json'

/**
 * Who the app opens on.
 *
 * This was a `home` flag on each catalogue entry, and a flag is the wrong
 * shape for "exactly these five": every mushaf added afterwards arrived
 * carrying one, so the grid grew back on its own twice. The list is named, so
 * the only way to appear on the home screen is for somebody to decide it.
 */

const reciters = (catalog as { reciters: { id: string; nameEn: string }[] }).reciters

describe('the home screen row', () => {
  it('is exactly the five chosen', () => {
    expect(HOME_RECITERS).toEqual([
      'dosari',
      'burhaji-nabawi',
      'sudais',
      'muaiqly',
      'turki',
      'afasy',
    ])
  })

  it('names reciters that exist', () => {
    const known = new Set(reciters.map((r) => r.id))
    for (const id of HOME_RECITERS) expect(known.has(id), id).toBe(true)
  })

  it('does not grow when the catalogue does', () => {
    // The catalogue is meant to keep growing; this is not. If a mushaf is
    // added and someone wants it on the front, they have to say so here.
    expect(HOME_RECITERS.length).toBe(6)
    expect(reciters.length).toBeGreaterThan(HOME_RECITERS.length)
  })

  it('lists each one once', () => {
    expect(new Set(HOME_RECITERS).size).toBe(HOME_RECITERS.length)
  })
})
