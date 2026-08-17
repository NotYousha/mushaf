import { describe, it, expect } from 'vitest'
import catalog from '../data/catalog.json'
import surahs from '../data/surahs.json'

describe('bundled data', () => {
  it('has 114 surah metadata entries', () => {
    expect(surahs).toHaveLength(114)
    expect(surahs[17].nameEn).toBe('Al-Kahf')
    expect(surahs[17].ayahs).toBe(110)
  })

  it('has 37 released surahs, all on archive.org', () => {
    expect(catalog.surahs).toHaveLength(37)
    for (const s of catalog.surahs) {
      expect(s.url).toMatch(/archive\.org/)
      expect(s.surah).toBeGreaterThanOrEqual(1)
      expect(s.surah).toBeLessThanOrEqual(37)
    }
  })

  it('has no duplicate surah numbers', () => {
    const nums = catalog.surahs.map((s) => s.surah)
    expect(new Set(nums).size).toBe(nums.length)
  })

  // 18, not 17: surah 28's only CORS-safe copy comes from a different uploader
  // than the correctly-labelled file, so it cannot be size-matched and stays unproven.
  it('flags 18 surahs as unverified pending an ear check', () => {
    expect(catalog.surahs.filter((s) => !s.verified)).toHaveLength(18)
  })

  it('never points at a CORS-blocked host', () => {
    for (const s of catalog.surahs) {
      expect(s.url).not.toMatch(/altilawat/)
    }
  })

  it('covers surahs 1-37 with no gaps', () => {
    const nums = catalog.surahs.map((s) => s.surah).sort((a, b) => a - b)
    expect(nums).toEqual(Array.from({ length: 37 }, (_, i) => i + 1))
  })
})
