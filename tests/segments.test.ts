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

/**
 * A changeover must be a measured onset, not a typed second.
 *
 * This is the fault the "next reciter" button was reported for: it landed a
 * second or two before the handover, so pressing it left you in the previous
 * imam's last phrase. The times come from chapter lists typed by hand under
 * the uploads, and a whole second is as fine as anyone types — but a typist
 * writes the second they notice the change, which is before the new voice
 * actually opens. Measured against the audio, forty of those marks moved a
 * median 1.06s later, and that lateness is exactly what a listener heard.
 *
 * A whole second is therefore a smell here, and this pins every handover that
 * still is one. Integer-ness is only a proxy for provenance, though, and it
 * has two kinds of exception — so each entry says which it is:
 *
 *   "no pause"  the onset could not be measured. No detectable quiet around
 *               the mark: the imam runs straight on, or the mark is somewhere
 *               else entirely. Measurement declined rather than guessed, and
 *               these are the ones still likely to feel a beat early.
 *   "measured"  the onset WAS measured and happens to land on a whole second.
 *               Nothing wrong with it; it just cannot be told from a typed
 *               mark by looking at the number.
 *
 * Any other whole-second handover means an unmeasured mark has been added —
 * most likely build-segments.mjs re-run without refine-segments.mjs after it.
 * Removing an entry when it does get measured is the point of having the list.
 */
describe('changeovers are measured, not typed', () => {
  // 1447's stored values are on the player's clock, a flat 0.997705 of true
  // time, so a typed second survives there as that second times the factor.
  const ELEMENT_FACTOR = 15963.28 / 16000

  const WHOLE_SECONDS: Record<string, 'no pause' | 'measured'> = {
    '1447:2@1836.78': 'measured',
    '1447:6@319.27': 'no pause',
    '1447:7@3148.76': 'no pause',
    '1446:6@2136': 'measured',
    '1446:7@1317': 'no pause',
    '1446:7@2231.98': 'measured',
    '1446:9@296': 'no pause',
    '1446:9@1238': 'no pause',
    '1446:9@2406': 'no pause',
    '1446:12@1050': 'measured',
    '1446:23@522': 'no pause',
    '1446:25@562': 'no pause',
    '1446:26@653': 'no pause',
    '1446:35@305': 'no pause',
    '1446:38@305': 'no pause',
    '1446:40@486': 'no pause',
    '1446:41@432': 'no pause',
    '1446:58@342': 'no pause',
  }

  /** Every handover in the data, as `year:surah@at`. */
  const handovers = () => {
    const out: { id: string; whole: boolean }[] = []
    for (const [key, surahs] of Object.entries(doc)) {
      const year = Number(key.split('-')[1])
      for (const [surah, list] of Object.entries(surahs)) {
        list.forEach(([at], i) => {
          // The opening entry is not a handover — it is whoever starts the
          // file, and 4 is a true value there rather than a typed one.
          if (i === 0) return
          const trueSecond = year === 1447 ? at / ELEMENT_FACTOR : at
          out.push({ id: `${year}:${surah}@${at}`, whole: Math.abs(trueSecond - Math.round(trueSecond)) <= 0.02 })
        })
      }
    }
    return out
  }

  it('carries no whole second that is not accounted for', () => {
    const unexplained = handovers().filter((h) => h.whole && !(h.id in WHOLE_SECONDS))
    expect(unexplained.map((h) => h.id)).toEqual([])
  })

  // A stale entry is worse than none: it accounts for a boundary that has
  // since moved, and hides the next real one.
  it('accounts for nothing that is no longer there', () => {
    const present = new Set(handovers().map((h) => h.id))
    for (const id of Object.keys(WHOLE_SECONDS)) {
      expect(present.has(id), `${id} is not in the data`).toBe(true)
    }
  })

  // The majority were measurable, and that is what makes the button land on
  // the voice. If this ratio collapses, the refinement pass did not run.
  it('has measured the large majority of handovers', () => {
    const all = handovers()
    const unmeasured = all.filter((h) => WHOLE_SECONDS[h.id] === 'no pause').length
    expect(all.length - unmeasured).toBeGreaterThan(all.length * 0.85)
  })
})
