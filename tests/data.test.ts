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
      // expiry, so these must never point straight at it. Audio shipped with
      // the app is same-origin and needs no proxy.
      expect(s.url).toMatch(/(workers\.dev\/b\/\d+\.mp3$|^audio\/)/)
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
        // Either a remote URL, or a path to audio shipped with the app.
        expect(s.url).toMatch(/^(https:\/\/|audio\/)/)
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

    // The source's files around 94-102 hold each other's recitations. Most
    // are recovered by pointing the surah at the file that actually contains
    // it, identified by duration against a reference for this same recording.
    it('recovers remapped surahs from the file that holds them', () => {
      for (const [surah, file] of [[94, 96], [95, 97], [96, 98], [98, 100], [99, 94], [100, 101], [101, 102], [102, 95]]) {
        const e = b.surahs.find((s) => s.surah === surah)
        expect(e, `surah ${surah} should be present`).toBeDefined()
        expect(e!.url).toContain(`/b/${file}.mp3`)
      }
    })

    // Al-Qadr is not in the source collection, so a copy of the same
    // recording ships with the app instead.
    it('is complete, with Al-Qadr served from a local copy', () => {
      expect(b.surahs).toHaveLength(114)
      const qadr = b.surahs.find((s) => s.surah === 97)!
      expect(qadr.url).toBe('audio/burhaji-097.mp3')
    })

    // Az-Zalzala and Al-Qaari'a are two tenths of a second apart, so they
    // were identified by ear rather than by measurement, and count as settled.
    it('treats ear-identified surahs as settled and the rest as needing a check', () => {
      for (const n of [97, 99, 100, 101]) {
        expect(b.surahs.find((s) => s.surah === n)!.verified).toBe(true)
      }
      for (const n of [94, 95, 96, 98, 102]) {
        expect(b.surahs.find((s) => s.surah === n)!.verified).toBe(false)
      }
    })

  })

  it('flags only remapped entries as needing an ear check', () => {
    // Everything else is resolved from its own source page, so the
    // name-to-audio association comes from the source, not a guess.
    for (const r of reciters) {
      const unverified = r.surahs.filter((s) => !s.verified).map((s) => s.surah)
      if (r.id === 'burhaji-nabawi') {
        expect(unverified.sort((a, b2) => a - b2)).toEqual([94, 95, 96, 98, 102])
      } else {
        expect(unverified).toHaveLength(0)
      }
    }
  })
})
