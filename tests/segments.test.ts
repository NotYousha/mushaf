import { describe, it, expect } from 'vitest'
import data from '../data/segments.json'
import imams from '../data/imams.json'
import voices from '../data/voices.json'
import {
  imamAt,
  nextChangeAfter,
  prevChangeBefore,
  segmentsFor,
  type Segment,
} from '../src/catalog/segments'

const doc = data as unknown as Record<string, Record<string, Segment[]>>
const roster = imams as Record<string, unknown>

describe('the published changeovers', () => {
  it('only covers years that publish them', () => {
    for (const key of Object.keys(doc)) {
      expect(key).toMatch(/^makkah-14\d\d$/)
    }
  })

  it('names only imams the roster knows', () => {
    for (const [key, surahs] of Object.entries(doc)) {
      for (const [surah, list] of Object.entries(surahs)) {
        for (const [, id] of list) {
          expect(roster[id], `${key}:${surah} names "${id}"`).toBeDefined()
        }
      }
    }
  })

  it('runs forward in time, and never repeats a reciter back to back', () => {
    for (const [key, surahs] of Object.entries(doc)) {
      for (const [surah, list] of Object.entries(surahs)) {
        for (let i = 1; i < list.length; i++) {
          expect(list[i][0], `${key}:${surah} out of order`).toBeGreaterThan(list[i - 1][0])
          expect(list[i][1], `${key}:${surah} repeats a reciter`).not.toBe(list[i - 1][1])
        }
      }
    }
  })

  // A single entry is not a changeover; those surahs belong to voices.json.
  it('only records surahs that actually change hands', () => {
    for (const [key, surahs] of Object.entries(doc)) {
      for (const [surah, list] of Object.entries(surahs)) {
        expect(list.length, `${key}:${surah}`).toBeGreaterThan(1)
      }
    }
  })

  /**
   * The changeovers must agree with the whole-surah attribution: both come
   * from the same descriptions, and a surah whose stretches name someone the
   * hashtags never mentioned would mean one of the two was misparsed.
   */
  it('agrees with the surah-level attribution', () => {
    const v = voices as Record<string, Record<string, string[]>>
    for (const [key, surahs] of Object.entries(doc)) {
      const byS = v[key]
      if (!byS) continue
      for (const [surah, list] of Object.entries(surahs)) {
        const named = new Set(byS[surah] ?? [])
        if (!named.size) continue
        for (const [, id] of list) {
          expect(named.has(id), `${key}:${surah} — ${id} is not in the hashtags`).toBe(true)
        }
      }
    }
  })
})

describe('who is reciting at a moment', () => {
  const key = Object.keys(doc)[0]
  const year = Number(key?.split('-')[1])
  const surah = Number(Object.keys(doc[key] ?? {})[0])
  const list = doc[key]?.[String(surah)] ?? []

  it('holds the first reciter through the opening', () => {
    // The basmalah and the seconds of silence belong to whoever opens.
    expect(imamAt('makkah', year, surah, 0)).toBe(list[0][1])
  })

  it('changes exactly on the published second', () => {
    const [at, id] = list[1]
    expect(imamAt('makkah', year, surah, at - 0.5)).toBe(list[0][1])
    expect(imamAt('makkah', year, surah, at)).toBe(id)
    expect(imamAt('makkah', year, surah, at + 30)).toBe(id)
  })

  it('is null where nothing is published', () => {
    expect(imamAt('madinah', 1447, 2, 100)).toBeNull()
    expect(segmentsFor('madinah', 1447, 2)).toBeNull()
  })
})

describe('stepping between reciters', () => {
  const key = Object.keys(doc)[0]
  const year = Number(key?.split('-')[1])
  const surah = Number(Object.keys(doc[key] ?? {})[0])
  const list = doc[key]?.[String(surah)] ?? []

  it('steps forward to the next handover', () => {
    const next = nextChangeAfter('makkah', year, surah, 0)
    expect(next?.at).toBe(list[1][0])
    expect(next?.id).toBe(list[1][1])
  })

  it('steps back to the previous one', () => {
    const from = list[2]?.[0] ?? list[1][0]
    const prev = prevChangeBefore('makkah', year, surah, from + 10)
    expect(prev).not.toBeNull()
    expect(prev!.at).toBeLessThan(from + 10)
  })

  it('has nothing left to step to at the end', () => {
    const last = list[list.length - 1][0]
    expect(nextChangeAfter('makkah', year, surah, last + 60)).toBeNull()
  })
})
