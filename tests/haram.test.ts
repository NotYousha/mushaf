import { describe, it, expect } from 'vitest'
import haramData from '../data/haram-years.json'
import imams from '../data/imams.json'
import catalog from '../data/catalog.json'
import { haramReciters, imamsOf, arabicDigits, haramId } from '../src/catalog/haram'

const years = haramReciters()
const roster = imams as Record<string, { name: string; nameEn: string }>

describe('the Grand Mosque years', () => {
  it('covers 1414-1447, skipping the year with a hole in it', () => {
    const got = years.map((r) => r.year!)
    const expected = []
    for (let y = 1447; y >= 1414; y--) if (y !== 1416) expected.push(y)
    expect(got).toEqual(expected)
    expect(got).toHaveLength(33)
  })

  // The year someone wants is nearly always the last one, and 1414 is a long
  // scroll from the top.
  it('is ordered newest first', () => {
    const ys = years.map((r) => r.year!)
    expect(ys).toEqual([...ys].sort((a, b) => b - a))
    expect(ys[0]).toBe(1447)
  })

  it('gives every year a complete mushaf with real sizes', () => {
    for (const r of years) {
      expect(r.surahs, String(r.year)).toHaveLength(114)
      expect(r.released).toBe(114)
      expect(r.surahs.map((s) => s.surah)).toEqual(
        Array.from({ length: 114 }, (_, i) => i + 1),
      )
      for (const s of r.surahs) expect(s.bytes, `${r.year}:${s.surah}`).toBeGreaterThan(0)
    }
  })

  // archive.org sends Access-Control-Allow-Origin: * but no
  // Access-Control-Expose-Headers, and neither ETag nor Content-Range is
  // CORS-safelisted — so a browser reads null for both and can neither size
  // nor resume a download. Pointing straight at the item would look like it
  // worked right up until someone tried to save a surah.
  it('routes every surah of every year through the CORS proxy', () => {
    for (const r of years) {
      for (const s of r.surahs) {
        expect(s.url).toBe(
          `https://mushaf-audio.mushaftarteel.workers.dev/haram/${r.year}/${s.surah}.mp3`,
        )
        expect(s.url).not.toMatch(/archive\.org/)
      }
    }
  })

  // Several imams led each of these Ramadans and no source records which
  // surah is whose, so nothing is asserted and every surah asks for an ear.
  it('claims nothing it cannot prove', () => {
    for (const r of years) {
      expect(r.surahs.every((s) => s.verified === false), String(r.year)).toBe(true)
      for (const s of r.surahs) {
        const e = s as { voice?: string; voiceEn?: string }
        expect(e.voice).toBeUndefined()
      }
    }
  })

  // Hafs, so the mushaf pages apply and must not stand down for these.
  it('carries no riwayah, so the Hafs pages stand', () => {
    for (const r of years) {
      expect(Object.prototype.hasOwnProperty.call(r, 'riwayah'), String(r.year)).toBe(false)
    }
  })

  it('keeps ids distinct from each other and from the four mushafs', () => {
    const ids = years.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    const existing = new Set(catalog.reciters.map((r) => r.id))
    for (const id of ids) expect(existing.has(id), id).toBe(false)
    expect(ids[0]).toBe(haramId(1447))
  })

  // Held out of the reciter strip: thirty-three more chips would bury the
  // four individual mushafs that belong there.
  it('marks every year as part of the haram group', () => {
    for (const r of years) expect(r.group).toBe('haram')
  })
})

describe('per-year attribution', () => {
  /**
   * Two items carry no names at all — their description field holds a single
   * stray quote character and nothing else. That is a gap in the source, not
   * a failure to match, so those years ship with an empty list and the row
   * simply omits the line rather than inventing one.
   *
   * Pinned rather than skipped: if a future rebuild fills either in, this
   * says so instead of quietly passing.
   */
  it('names imams for every year the source describes', () => {
    const silent = years.filter((r) => imamsOf(r.year!).length === 0).map((r) => r.year)
    expect(silent).toEqual([1419, 1414])

    for (const r of years.filter((x) => !silent.includes(x.year))) {
      const led = imamsOf(r.year!)
      expect(led.length, String(r.year)).toBeGreaterThan(0)
      for (const who of led) {
        expect(who.name.trim().length).toBeGreaterThan(0)
        expect(who.nameEn.trim().length).toBeGreaterThan(0)
      }
    }
  })

  // It would be far easier to paste one roster onto every year, and it would
  // be wrong. 1428 names Ash-Shuraim and not Baleela or Ad-Dosari, which is
  // right for 2007 — proof the source lists are per-year rather than boilerplate.
  it('varies by year rather than repeating one roster', () => {
    const shapes = new Set(years.map((r) => imamsOf(r.year!).map((w) => w.nameEn).join('|')))
    expect(shapes.size).toBeGreaterThan(1)

    const of = (y: number) => imamsOf(y).map((w) => w.nameEn)
    expect(of(1447)).toContain('Bandar Baleela')
    expect(of(1428)).toContain('Saud Ash-Shuraim')
    expect(of(1428)).not.toContain('Bandar Baleela')
  })

  it('uses only ids the roster defines', () => {
    for (const y of haramData.years) {
      for (const id of y.imams) expect(roster[id], `${y.year} names "${id}"`).toBeDefined()
    }
  })
})

describe('the folded data file', () => {
  /**
   * The catalog's one-object-per-surah shape costs about 226 bytes each.
   * 33 years is 3,762 surahs, so that shape here would add roughly 850 KB to
   * a file that ships inside the JS bundle and every visitor downloads before
   * the app paints. Only the byte count varies per surah — the URL is a pure
   * function of year and surah — so a year is stored as its number, its imams
   * and a flat array of sizes.
   *
   * This guards the saving: if someone expands the file back into objects,
   * this fails long before anyone notices the bundle got slower.
   */
  it('stays small enough to bundle', () => {
    const size = JSON.stringify(haramData).length
    expect(size).toBeLessThan(80_000)
    expect(haramData.years.length * 114).toBe(3762)
  })

  it('stores a flat byte array per year, not surah objects', () => {
    for (const y of haramData.years) {
      expect(y.bytes, String(y.year)).toHaveLength(114)
      for (const b of y.bytes) expect(typeof b).toBe('number')
    }
  })

  // The Gregorian year is read from the item's own title rather than computed,
  // because a Hijri year straddles two of them.
  it('carries the Gregorian year the source states', () => {
    const y1447 = haramData.years.find((y) => y.year === 1447)!
    expect(y1447.ce).toBe(2026)
    const y1414 = haramData.years.find((y) => y.year === 1414)!
    expect(y1414.ce).toBeGreaterThan(1990)
    expect(y1414.ce).toBeLessThan(1996)
  })
})

describe('arabicDigits', () => {
  // ١٤٤٧ rather than 1447, so the year sits correctly in the Arabic around it.
  it('renders a year in Arabic-Indic digits', () => {
    expect(arabicDigits(1447)).toBe('١٤٤٧')
    expect(arabicDigits(1414)).toBe('١٤١٤')
  })
})
