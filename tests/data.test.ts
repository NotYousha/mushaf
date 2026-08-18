import { describe, it, expect } from 'vitest'
import catalog from '../data/catalog.json'
import surahs from '../data/surahs.json'

const reciters = catalog.reciters

describe('bundled data', () => {
  it('has 114 surah metadata entries', () => {
    expect(surahs).toHaveLength(114)
    expect(surahs[17].nameEn).toBe('Al-Kahf')
    expect(surahs[17].ayahs).toBe(110)
  })

  it('carries both reciters', () => {
    expect(reciters.map((r) => r.id).sort()).toEqual(['burhaji-nabawi', 'dosari'])
  })

  it("routes the Prophet's Mosque mushaf through the CORS proxy", () => {
    const n = reciters.find((r) => r.id === 'burhaji-nabawi')!
    expect(n.surahs).toHaveLength(114)
    for (const s of n.surahs) {
      // The origin bucket sends no CORS header and signs URLs with a 7-day
      // expiry, so these must never point straight at it.
      expect(s.url).toMatch(/workers\.dev\/b\/\d+\.mp3$/)
      expect(s.url).not.toMatch(/digitaloceanspaces|X-Amz-Signature/)
    }
  })

  it('gives every reciter a distinct id and a full name', () => {
    const ids = reciters.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const r of reciters) {
      expect(r.fullName.length).toBeGreaterThan(0)
      expect(r.mushaf.length).toBeGreaterThan(0)
    }
  })

  it('never points at a CORS-blocked host', () => {
    for (const r of reciters) {
      for (const s of r.surahs) {
        expect(s.url).not.toMatch(/altilawat/)
        expect(s.url).toMatch(/^https:\/\//)
      }
    }
  })

  it('has no duplicate or out-of-range surah numbers', () => {
    for (const r of reciters) {
      const nums = r.surahs.map((s) => s.surah)
      expect(new Set(nums).size).toBe(nums.length)
      for (const n of nums) {
        expect(n).toBeGreaterThanOrEqual(1)
        expect(n).toBeLessThanOrEqual(114)
      }
    }
  })

  it('gives every surah a positive byte size', () => {
    for (const r of reciters) {
      expect(r.surahs.filter((s) => !s.bytes)).toHaveLength(0)
    }
  })

  describe('Al-Dosari — still being recorded', () => {
    const d = reciters.find((r) => r.id === 'dosari')!

    it('covers surahs 1-37 with no gaps', () => {
      const nums = d.surahs.map((s) => s.surah).sort((a, b) => a - b)
      expect(nums).toEqual(Array.from({ length: 37 }, (_, i) => i + 1))
    })

    it('flags the entries that need an ear check', () => {
      expect(d.surahs.filter((s) => !s.verified)).toHaveLength(18)
    })
  })

  describe('Burhaji — complete', () => {
    const b = reciters.find((r) => r.id === 'burhaji-nabawi')!

    it('covers all 114 surahs', () => {
      const nums = b.surahs.map((s) => s.surah).sort((a, b2) => a - b2)
      expect(nums).toEqual(Array.from({ length: 114 }, (_, i) => i + 1))
    })

    it('needs no ear check — filenames match surah numbers at the source', () => {
      expect(b.surahs.filter((s) => !s.verified)).toHaveLength(0)
    })
  })
})
