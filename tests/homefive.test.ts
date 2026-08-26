import { describe, it, expect } from 'vitest'
import { HOME_RECITERS } from '../src/catalog/home'
import catalog from '../data/catalog.json'
import { readFileSync } from 'node:fs'

/**
 * Who the app opens on.
 *
 * This was a `home` flag on each catalogue entry, and a flag is the wrong
 * shape for "exactly these five": every mushaf added afterwards arrived
 * carrying one, so the grid grew back on its own twice. The list is named, so
 * the only way to appear on the home screen is for somebody to decide it.
 */

const reciters = (catalog as { reciters: { id: string; nameEn: string; photo?: string }[] })
  .reciters

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

  /**
   * Every home portrait is preloaded, and only those.
   *
   * They are painted as background images, so nothing asks for them until the
   * grid renders — which on a slow connection put the last face nearly four
   * seconds in, queued behind the bundle, the fonts and the resume artwork.
   * The preloads in index.html fix that, and they are a second copy of this
   * list: when it grew from five to six mid-session, nothing would have said
   * the newcomer had been left out.
   */
  it('is preloaded, every one of them', () => {
    const html = readFileSync('index.html', 'utf8')
    const preloaded = [...html.matchAll(/rel="preload"[^>]*href="([^"]+)"/g)]
      .map((m) => m[1].split('/').pop())
    const photos = HOME_RECITERS.map(
      (id) => reciters.find((r) => r.id === id)?.photo,
    ).filter(Boolean)

    expect(photos).toHaveLength(HOME_RECITERS.length)
    for (const photo of photos) expect(preloaded, photo).toContain(photo)
    // And nothing else: a preload for a face that is no longer on the home
    // screen is bytes spent on the critical path for nobody.
    for (const p of preloaded) expect(photos, p).toContain(p)
  })

  it('lists each one once', () => {
    expect(new Set(HOME_RECITERS).size).toBe(HOME_RECITERS.length)
  })
})
