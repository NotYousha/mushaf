import { describe, it, expect } from 'vitest'
import { readFileSync, statSync } from 'node:fs'

/**
 * What AirPlay puts on a television.
 *
 * The Media Session API chooses an entry by the `sizes` it is given, so a
 * declared size that does not match the file is not a hint — it is wrong
 * information the system acts on. Declaring one 512px file six times as 96
 * through 512 told it there was nothing larger, and it upscaled a 512 to fill
 * a TV panel.
 */

const src = readFileSync('src/player/mediaSession.ts', 'utf8')

/** Width and height out of a PNG's IHDR, which is always the first chunk. */
function pngSize(path: string): [number, number] {
  const b = readFileSync(path)
  expect(b.subarray(0, 8).toString('hex'), path).toBe('89504e470d0a1a0a')
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

describe('now playing artwork', () => {
  const declared = [...src.matchAll(/const ARTWORK = \[([^\]]+)\]/g)]
    .flatMap((m) => m[1].split(',').map((n) => Number(n.trim())))

  it('declares at least one size big enough for a television', () => {
    expect(declared.length).toBeGreaterThan(0)
    expect(Math.max(...declared)).toBeGreaterThanOrEqual(1024)
  })

  it('ships a file at every size it claims, and at exactly that size', () => {
    for (const size of declared) {
      const [w, h] = pngSize(`public/nowplaying-${size}.png`)
      expect([w, h], `nowplaying-${size}.png`).toEqual([size, size])
    }
  })

  it('names the files it actually ships', () => {
    // The previous src pointed at icon-512.png, which was renamed out from
    // under it and became a 404 — silently, because artwork that fails to
    // load just leaves the lock screen blank.
    expect(src).toContain('`${base}nowplaying-${size}.png`')
  })

  it('keeps them small enough to precache', () => {
    // They are in the service worker's precache so the lock screen has
    // artwork offline. That is only defensible while they are small.
    const total = declared.reduce(
      (sum, size) => sum + statSync(`public/nowplaying-${size}.png`).size,
      0,
    )
    expect(total).toBeLessThan(400 * 1024)
  })

  it('is square, because every surface that shows it is', () => {
    for (const size of declared) {
      const [w, h] = pngSize(`public/nowplaying-${size}.png`)
      expect(w).toBe(h)
    }
  })
})
