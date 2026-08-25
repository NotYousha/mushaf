import { describe, it, expect } from 'vitest'
import { hasTimings, surahTimed, timedReciters } from '../src/mushaf/data'
import dosari from '../data/timings-dosari.json'
import burhaji from '../data/timings-burhaji-nabawi.json'

/**
 * Registration is not coverage.
 *
 * Al-Dosari was listed as timed with an empty set, and he is the reciter the
 * app opens with — so word following, Talqeen and the Fork Drill each went as
 * far as trying before failing, on first contact, for every new listener. The
 * Fork Drill even offered a retry gated on the same check that had just
 * failed, so it could never succeed.
 */
describe('who the app can actually follow word by word', () => {
  it('does not claim timings for a reciter whose file is empty', () => {
    expect(Object.keys(dosari.surahs), 'the stub is still empty').toHaveLength(0)
    expect(hasTimings('dosari')).toBe(false)
    expect(timedReciters()).not.toContain('dosari')
  })

  it('still claims them for the reciter who has them', () => {
    expect(Object.keys(burhaji.surahs).length).toBeGreaterThan(100)
    expect(hasTimings('burhaji-nabawi')).toBe(true)
    expect(timedReciters()).toContain('burhaji-nabawi')
  })

  it('claims nothing for a Taraweeh year or an unknown reciter', () => {
    expect(hasTimings('haram-1447')).toBe(false)
    expect(hasTimings('nobody')).toBe(false)
  })

  // Coverage is per surah, so a timed reciter is not timed everywhere.
  it('answers per surah, not per reciter', () => {
    expect(surahTimed('dosari', 1)).toBe(false)
    expect(surahTimed('burhaji-nabawi', null)).toBe(false)
  })
})
