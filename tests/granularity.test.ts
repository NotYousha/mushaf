import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import {
  loadTimings,
  timingGranularity,
  hasTimings,
  timedReciters,
  wordSchedule,
  ayahStartsFor,
  type Timings,
} from '../src/mushaf/data'

/**
 * Following a recitation, and saying honestly how closely.
 *
 * The app already learned once that registering a reciter with an empty
 * timing file breaks three features on contact. The same trap is open wider
 * now that two kinds of timing exist: a verse-timed file is byte-compatible
 * with a word-timed one, so everything that reads it will happily treat the
 * first word of each ayah as the only word being recited unless something
 * stops it.
 */

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as Timings

describe('timing granularity', () => {
  it('reports nothing before the file has loaded', () => {
    // The honest answer at that moment. A page that promises to follow and
    // then does not is worse than one that never promised.
    expect(timingGranularity('budair', 1)).toBe(null)
  })

  it('reports the verse-timed reciters as verse-timed once loaded', async () => {
    await loadTimings('budair')
    expect(timingGranularity('budair', 1)).toBe('ayah')
    expect(timingGranularity('budair', 114)).toBe('ayah')
  })

  it('reports the word-timed reciter as word-timed', async () => {
    await loadTimings('burhaji-nabawi')
    expect(timingGranularity('burhaji-nabawi', 1)).toBe('word')
  })

  it('reports nothing for a reciter with no timings at all', async () => {
    await loadTimings('dosari')
    expect(timingGranularity('dosari', 1)).toBe(null)
    expect(timingGranularity('nobody', 1)).toBe(null)
    expect(timingGranularity('burhaji-nabawi', null)).toBe(null)
  })

  it('keeps Talqeen and the fork drill to word timings only', async () => {
    // Both gate on hasTimings, and both need to know which word is being
    // said. A verse-timed reciter must not open them.
    await loadTimings('budair')
    expect(hasTimings('budair')).toBe(false)
    expect(hasTimings('burhaji-nabawi')).toBe(true)
    expect(timedReciters()).not.toContain('budair')
    expect(timedReciters()).toContain('burhaji-nabawi')
  })

  it('offers no word positions for a verse-timed recitation', () => {
    const verse: Timings = {
      unit: 'ms',
      source: 'test',
      granularity: 'ayah',
      surahs: { 1: [[1, [1000]], [2, [4000]]] },
    }
    // Not two words at 1000 and 4000 — no words at all. Returning them would
    // box the first word of each ayah and leave it boxed for the whole verse.
    expect(wordSchedule(verse, 1)).toEqual([])
  })

  it('still offers verse starts for a verse-timed recitation', async () => {
    await loadTimings('jaber')
    const starts = ayahStartsFor('jaber', 1)
    expect(starts).toHaveLength(7)
    // Monotonic: an ayah never begins before the one before it.
    for (let i = 1; i < starts!.length; i++) {
      expect(starts![i]).toBeGreaterThan(starts![i - 1])
    }
  })
})

describe('the shipped timing files', () => {
  const layout = JSON.parse(readFileSync('data/mushaf-layout.json', 'utf8')) as {
    pages: { w: [string, string?][] }[][]
  }
  const words = new Map<string, number>()
  for (const lines of layout.pages) {
    for (const line of lines) {
      for (const w of line.w) {
        if (!w[1]) continue
        const [s, a] = w[1].split(':')
        const k = `${s}:${a}`
        words.set(k, (words.get(k) ?? 0) + 1)
      }
    }
  }

  it('gives a word-timed ayah exactly as many starts as the page has words', () => {
    /*
     * The bug this catches shipped.
     *
     * timings-burhaji-nabawi.json carried 77,433 starts against the layout's
     * 77,429 — four ayahs with one too many, because the printed page sets
     * بَعْدَ مَا and إِلْ يَاسِينَ as single tokens and the timing source
     * counts two words. One surplus start shifts every word after it, so the
     * highlight ran a word ahead for the rest of 2:181, 8:6, 13:37 and
     * 37:130. Nothing failed; it was just wrong, quietly, in four places.
     */
    const t = read('data/timings-burhaji-nabawi.json')
    const wrong: string[] = []
    for (const [surah, verses] of Object.entries(t.surahs)) {
      for (const [ayah, starts] of verses) {
        const want = words.get(`${surah}:${ayah}`)
        if (starts.length !== want) wrong.push(`${surah}:${ayah} ${starts.length}≠${want}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('gives a verse-timed ayah exactly one start', () => {
    for (const id of ['budair', 'jaber', 'juhany-hafs']) {
      const file = `data/timings-${id}.json`
      expect(existsSync(file), file).toBe(true)
      const t = read(file)
      expect(t.granularity, id).toBe('ayah')
      // Provenance is not optional for these: a timing file belongs to a
      // recording, and the only reason these three are here is that their
      // audio was checked against the source the timings came from.
      expect(t.source, id).toMatch(/identical|agrees|within/i)
      for (const verses of Object.values(t.surahs)) {
        for (const [, starts] of verses) expect(starts).toHaveLength(1)
      }
    }
  })

  it('covers whole surahs or none of them', () => {
    // A half-timed surah leaves the highlight stuck on the last timed ayah
    // while the recitation carries on, which reads as the app having frozen.
    const counts = new Map<number, number>()
    for (const [k] of words) {
      const s = Number(k.split(':')[0])
      counts.set(s, (counts.get(s) ?? 0) + 1)
    }
    for (const id of ['budair', 'jaber', 'juhany-hafs']) {
      const t = read(`data/timings-${id}.json`)
      for (const [surah, verses] of Object.entries(t.surahs)) {
        expect(verses.length, `${id} surah ${surah}`).toBe(counts.get(Number(surah)))
      }
    }
  })

  it('ships no timings for any Taraweeh compilation', () => {
    /*
     * Not an oversight, and not a gap to be filled from outside.
     *
     * No word or verse timings exist for any Makkah or Madinah Taraweeh
     * recording, from any published source. They are one recording per surah
     * per year, made in the mosque, and nobody has aligned them. If a file
     * ever appears for one, it came from our own forced alignment and its
     * provenance needs writing down before it ships.
     */
    const src = readFileSync('src/mushaf/data.ts', 'utf8')
    const registry = src.slice(src.indexOf('const TIMED'), src.indexOf('Al-Dosari is deliberately'))
    expect(registry).not.toMatch(/makkah|madinah|haram|nabawi-\d|taraweeh/i)
  })
})
