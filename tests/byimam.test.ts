import { describe, it, expect } from 'vitest'
import { readingsOf, imamDirectory, seasonsOf } from '../src/catalog/byImam'
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

const summaries = imamDirectory(surahSeconds)

describe('browse by reciter', () => {
  it('finds every attributed imam and no invented ones', () => {
    expect(summaries.length).toBeGreaterThan(5)
    const known = new Set(allImams().map((i: { id: string }) => i.id))
    for (const s of summaries) expect(known.has(s.id)).toBe(true)
  })

  it('gives each of them something to reach', () => {
    for (const s of summaries) {
      expect(s.years.length + s.seasons.length).toBeGreaterThan(0)
      expect(s.readings).toBeGreaterThanOrEqual(s.surahs)
    }
  })

  it('orders by how many Ramadans each man has led', () => {
    const counts = summaries.map((s) => s.years.length + s.seasons.length)
    expect([...counts].sort((a, b) => b - a)).toEqual(counts)
  })

  it('never counts a year at both depths', () => {
    for (const s of summaries) {
      const named = new Set(s.years)
      for (const se of s.seasons) expect(named.has(se.year)).toBe(false)
    }
  })

  it('reaches far more of the archive than attribution alone', () => {
    // Seven imams have named surahs; the rosters carry the rest of the years,
    // and losing that fallback would quietly shrink the list back to seven.
    expect(summaries.length).toBeGreaterThan(20)
    const seasons = new Set(
      summaries.flatMap((s) => s.seasons.map((se) => `${se.place}-${se.year}`)),
    )
    expect(seasons.size).toBeGreaterThan(40)
  })

  it('points every Ramadan at a collection the app can open', () => {
    for (const se of seasonsOf(summaries[0].id)) {
      expect(se.reciterId).toMatch(/^(haram|nabawi)-\d{4}$/)
    }
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
