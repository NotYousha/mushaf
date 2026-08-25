import { describe, it, expect } from 'vitest'
import { readingsOf, imamsWithReadings } from '../src/catalog/byImam'
import { surahSeconds, allImams } from '../src/catalog/mosques'
import { segmentsFor, imamAt } from '../src/catalog/segments'

/**
 * The reverse index has to agree with the forward one.
 *
 * Both read the same two files, but a listener meets them in different places
 * — the player names whoever is reciting now, and this list claims to hold
 * everything he recites. If they ever disagree, one of the two screens is
 * lying about a man's name against a recording of the Quran, so the tests
 * here are mostly about the two staying the same answer.
 */

const summaries = imamsWithReadings(surahSeconds)

describe('browse by reciter', () => {
  it('finds every attributed imam and no invented ones', () => {
    expect(summaries.length).toBeGreaterThan(5)
    const known = new Set(allImams().map((i) => i.id))
    for (const s of summaries) expect(known.has(s.id)).toBe(true)
  })

  it('gives each of them something to play', () => {
    for (const s of summaries) {
      expect(s.surahs).toBeGreaterThan(0)
      expect(s.readings).toBeGreaterThanOrEqual(s.surahs)
      expect(s.years.length).toBeGreaterThan(0)
    }
  })

  it('orders by how much of the archive each man carries', () => {
    const counts = summaries.map((s) => s.surahs)
    expect([...counts].sort((a, b) => b - a)).toEqual(counts)
  })

  it('agrees with the player about who is reciting at a given moment', () => {
    let checked = 0
    for (const s of summaries) {
      for (const r of readingsOf(s.id)) {
        if (r.whole) continue
        // A second past his start, the forward lookup must name him too.
        expect(imamAt(r.place, r.year, r.surah, r.from + 1)).toBe(s.id)
        checked++
      }
    }
    // If the segment data ever empties, this test must fail rather than pass
    // vacuously.
    expect(checked).toBeGreaterThan(50)
  })

  it('ends a shared stretch where the next man starts, and never before', () => {
    for (const s of summaries) {
      for (const r of readingsOf(s.id)) {
        if (r.to === null) continue
        expect(r.to).toBeGreaterThan(r.from)
        const changes = segmentsFor(r.place, r.year, r.surah) ?? []
        expect(changes.some(([at]) => at === r.to)).toBe(true)
      }
    }
  })

  it('never starts a reading past the end of its recording', () => {
    for (const s of summaries) {
      for (const r of readingsOf(s.id)) {
        const total = surahSeconds(r.place, r.year, r.surah)
        if (total === null) continue
        expect(r.from).toBeLessThan(total)
      }
    }
  })

  it('points at a reciter entry the catalogue can actually load', () => {
    for (const r of readingsOf(summaries[0].id)) {
      expect(r.reciterId).toMatch(/^(haram|nabawi)-\d{4}$/)
      expect(r.surah).toBeGreaterThanOrEqual(1)
      expect(r.surah).toBeLessThanOrEqual(114)
    }
  })

  it('reads newest first, the way the years are offered everywhere else', () => {
    const years = readingsOf(summaries[0].id).map((r) => r.year)
    expect([...years].sort((a, b) => b - a)).toEqual(years)
  })
})
