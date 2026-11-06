import { describe, it, expect, afterEach, vi } from 'vitest'
import { PlayerEngine } from '../src/player/engine'

afterEach(() => vi.unstubAllGlobals())

describe('loading a surah offline', () => {
  it('fails at once, with a code the interface can translate', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    const e = new PlayerEngine()
    const t0 = Date.now()
    const res = await e.load('dosari', 2, 'https://example.test/2.mp3')
    expect(res.ok).toBe(false)
    expect(!res.ok && res.code).toBe('offline')
    // No 15-second wait on a timeout that cannot succeed.
    expect(Date.now() - t0).toBeLessThan(2000)
  })
})
