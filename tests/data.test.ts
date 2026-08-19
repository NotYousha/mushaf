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

  // Asserts that no expected reciter has disappeared, without failing merely
  // because another has been added.
  it.each(['dosari', 'burhaji-nabawi', 'turki'])('still carries %s', (id) => {
    expect(reciters.find((r) => r.id === id)).toBeDefined()
  })

  it('gives every reciter a photo field, even when there is no photo', () => {
    for (const r of reciters) {
      expect(Object.prototype.hasOwnProperty.call(r, 'photo')).toBe(true)
    }
  })

  it("routes the Prophet's Mosque mushaf through the CORS proxy", () => {
    const n = reciters.find((r) => r.id === 'burhaji-nabawi')!
    expect(n.surahs.length).toBeGreaterThan(100)
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

    // This mushaf grows as episodes air, so asserting a fixed count would
    // fail CI every time the weekly refresh picks up a new surah — and block
    // the deploy it is meant to trigger. Assert the shape instead.
    it('runs contiguously from surah 1 with no gaps', () => {
      const nums = d.surahs.map((s) => s.surah).sort((a, b) => a - b)
      expect(nums).toEqual(Array.from({ length: nums.length }, (_, i) => i + 1))
      expect(nums.length).toBeGreaterThanOrEqual(37)
      expect(nums.length).toBeLessThanOrEqual(114)
    })

    it('matches its own released count', () => {
      expect(d.released).toBe(d.surahs.length)
    })
  })

  describe('Burhaji', () => {
    const b = reciters.find((r) => r.id === 'burhaji-nabawi')!

    // The source's files for these four hold a different surah's recitation.
    // They are left out rather than served, because playing the wrong surah
    // is worse than the surah being absent.
    it('omits the four surahs whose source files are wrong', () => {
      for (const n of [96, 98, 99, 100]) {
        expect(b.surahs.find((s) => s.surah === n)).toBeUndefined()
      }
      expect(b.surahs).toHaveLength(110)
    })

    it('says why they are missing', () => {
      expect(b.note).toBeTruthy()
    })
  })

  it('resolves audio per surah page, so nothing needs an ear check', () => {
    // Both mushafs are now resolved from each surah's own page rather than by
    // reading a surah number out of a filename, which is what made entries
    // uncertain before.
    for (const r of reciters) {
      expect(r.surahs.filter((s) => !s.verified)).toHaveLength(0)
    }
  })
})
