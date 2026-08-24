import { describe, it, expect } from 'vitest'
import { nextVoiceChange } from '../src/player/playQueue'
import { mosqueReciters } from '../src/catalog/mosques'
import { buildView, surahMeta } from '../src/catalog/load'

/** surah -> voice, for a small hand-made year. */
const of = (map: Record<number, string | null>) => (s: number) => map[s] ?? null

describe('nextVoiceChange', () => {
  const all = [1, 2, 3, 4, 5]
  const voices = of({ 1: 'A', 2: 'A', 3: 'B', 4: 'B', 5: 'C' })

  it('skips past the rest of this reciter to the next one', () => {
    expect(nextVoiceChange(1, all, voices)).toBe(3)
    expect(nextVoiceChange(2, all, voices)).toBe(3)
    expect(nextVoiceChange(3, all, voices)).toBe(5)
  })

  it('steps backwards to the previous change', () => {
    expect(nextVoiceChange(5, all, voices, -1)).toBe(4)
    expect(nextVoiceChange(4, all, voices, -1)).toBe(2)
  })

  // Null disables the control rather than letting it jump somewhere arbitrary.
  it('is null at the last reciter, and on an unattributed entry', () => {
    expect(nextVoiceChange(5, all, voices)).toBeNull()
    expect(nextVoiceChange(1, all, of({}))).toBeNull()
  })

  // Going from one imam to two is a change of what you are listening to.
  it('treats a change in the set of reciters as a change', () => {
    const shared = of({ 1: 'A', 2: 'A · B', 3: 'B' })
    expect(nextVoiceChange(1, [1, 2, 3], shared)).toBe(2)
  })

  it('never returns a surah that is not available', () => {
    expect(nextVoiceChange(1, [1, 2, 5], voices)).toBe(5)
  })
})

describe('against the real 1447 attribution', () => {
  const year = mosqueReciters().find((r) => r.id === 'haram-1447')!
  const view = buildView(year, surahMeta)
  const voiceOf = (s: number) => view.find((v) => v.surah === s)?.voice ?? null
  const all = view.map((v) => v.surah)

  it('lands on a surah whose reciter really differs', () => {
    const from = 36
    const to = nextVoiceChange(from, all, voiceOf)
    expect(to).not.toBeNull()
    expect(voiceOf(to!)).not.toBe(voiceOf(from))
    expect(to!).toBeGreaterThan(from)
  })

  // Seven imams over 114 surahs: there should be plenty of handovers to walk.
  it('walks the whole year in far fewer steps than there are surahs', () => {
    let at: number | null = 1
    let steps = 0
    while (at !== null && steps < 200) {
      const next: number | null = nextVoiceChange(at, all, voiceOf)
      if (next === null) break
      at = next
      steps++
    }
    expect(steps).toBeGreaterThan(5)
    expect(steps).toBeLessThan(114)
  })
})
