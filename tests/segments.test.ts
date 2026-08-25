import { describe, it, expect } from 'vitest'
import data from '../data/segments.json'
import imams from '../data/imams.json'
import voices from '../data/voices.json'
import mosqueYears from '../data/mosque-years.json'
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

/**
 * Every changeover has to land inside the file it describes.
 *
 * This is the fault that shipped: the archive mirror's list for Al-Baqarah
 * 1447 ran past 1:58:00 against a recording that ends at 1:38:26, because it
 * described a different edit of that night. The last three reciters sat beyond
 * the end of the audio, so Bandar Baleela stayed on screen for the final three
 * quarters of an hour of the surah — a name and a face that were simply wrong.
 */
describe('changeovers land inside the recording', () => {
  const years = mosqueYears as unknown as {
    mosques: Record<string, { year: number; secs: number[] }[]>
  }

  it('never places a reciter past the end of the file', () => {
    for (const [key, surahs] of Object.entries(doc)) {
      const [place, year] = key.split('-')
      const row = years.mosques[place]?.find((r) => r.year === Number(year))
      expect(row, `no durations for ${key}`).toBeDefined()
      for (const [surah, list] of Object.entries(surahs)) {
        const length = row!.secs[Number(surah) - 1]
        expect(length, `${key}:${surah} has no duration`).toBeGreaterThan(0)
        for (const [at, id] of list) {
          expect(
            at,
            `${key}:${surah} puts ${id} at ${at}s in a ${length}s recording`,
          ).toBeLessThan(length)
        }
      }
    }
  })

  // The opening stretch has to start at the start, or the surah begins with
  // nobody named.
  it('starts each surah within its first minute', () => {
    for (const [key, surahs] of Object.entries(doc)) {
      for (const [surah, list] of Object.entries(surahs)) {
        expect(list[0][0], `${key}:${surah} starts late`).toBeLessThan(60)
      }
    }
  })

  // Al-Baqarah 1447 is the one that was wrong, pinned by name.
  it('gets Al-Baqarah 1447 right end to end', () => {
    const list = doc['makkah-1447']?.['2']
    expect(list).toBeDefined()
    expect(list.map(([, id]) => id)).toEqual([
      'turki',
      'shamsan',
      'sudais',
      'juhany',
      'baleela',
      'dosari',
      'muaiqly',
      'turki',
    ])
    const length = years.mosques.makkah.find((r) => r.year === 1447)!.secs[1]
    expect(list[list.length - 1][0]).toBeLessThan(length)
  })
})
