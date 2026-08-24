import { describe, it, expect } from 'vitest'
import doc from '../data/mosque-years.json'
import imams from '../data/imams.json'
import catalog from '../data/catalog.json'
import {
  mosqueReciters,
  imamsOf,
  arabicDigits,
  mosqueId,
  excludedYears,
  PLACES,
  type Place,
} from '../src/catalog/mosques'

const all = mosqueReciters()
const of = (p: Place) => all.filter((r) => r.group === p)
const roster = imams as Record<string, { name: string; nameEn: string }>

describe('the mosque years', () => {
  it('publishes both mosques', () => {
    expect(of('makkah').length).toBeGreaterThan(25)
    expect(of('madinah').length).toBeGreaterThan(20)
    expect(all.length).toBe(of('makkah').length + of('madinah').length)
  })

  // The year someone wants is nearly always the last one.
  it('orders each mosque newest first', () => {
    for (const m of PLACES) {
      const ys = of(m.place).map((r) => r.year!)
      expect(ys, m.place).toEqual([...ys].sort((a, b) => b - a))
    }
  })

  it('gives every year a complete mushaf with real sizes', () => {
    for (const r of all) {
      expect(r.surahs, r.id).toHaveLength(114)
      expect(r.released).toBe(114)
      expect(r.surahs.map((s) => s.surah)).toEqual(Array.from({ length: 114 }, (_, i) => i + 1))
      for (const s of r.surahs) expect(s.bytes, `${r.id}:${s.surah}`).toBeGreaterThan(0)
    }
  })

  // archive.org sends Access-Control-Allow-Origin: * but no
  // Access-Control-Expose-Headers, and neither ETag nor Content-Range is
  // CORS-safelisted — so a browser reads null for both and can neither size
  // nor resume a download. Pointing straight at an item would look like it
  // worked right up until someone tried to save a surah.
  it('routes every surah through the CORS proxy', () => {
    for (const r of all) {
      for (const s of r.surahs) {
        expect(s.url).toMatch(
          /^https:\/\/mushaf-audio\.mushaftarteel\.workers\.dev\/(haram|nabawi)\/\d{4}\/\d{1,3}\.mp3$/,
        )
        expect(s.url).not.toMatch(/archive\.org/)
      }
    }
  })

  /**
   * Makkah ids stay on the 'haram' prefix they first shipped with. Saved audio
   * is keyed by reciter id, so renaming would orphan every download someone
   * already has, and the Worker keeps the matching route for the same reason.
   */
  it('keeps the id prefix that saved downloads are keyed by', () => {
    expect(mosqueId('makkah', 1447)).toBe('haram-1447')
    expect(mosqueId('madinah', 1447)).toBe('nabawi-1447')
    expect(of('makkah').every((r) => r.id.startsWith('haram-'))).toBe(true)
    expect(of('madinah').every((r) => r.id.startsWith('nabawi-'))).toBe(true)
  })

  it('keeps ids distinct from each other and from the four mushafs', () => {
    const ids = all.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    const existing = new Set(catalog.reciters.map((r) => r.id))
    for (const id of ids) expect(existing.has(id), id).toBe(false)
  })

  // Both mosques recite Hafs, so the mushaf pages apply and must not stand
  // down for these the way they do for Al-Juhany.
  it('carries no riwayah, so the Hafs pages stand', () => {
    for (const r of all) {
      expect(Object.prototype.hasOwnProperty.call(r, 'riwayah'), r.id).toBe(false)
    }
  })

  // Several imams led each Ramadan and no source records which surah is
  // whose, so nothing is asserted and every surah asks for an ear.
  it('claims nothing it cannot prove', () => {
    for (const r of all) {
      expect(r.surahs.every((s) => s.verified === false), r.id).toBe(true)
      for (const s of r.surahs) {
        expect((s as { voice?: string }).voice).toBeUndefined()
      }
    }
  })
})

/**
 * The years deliberately left out, each because an item was checked and found
 * not to be what it claims. These are pinned so a regenerated data file cannot
 * quietly readmit a recording that was removed for cause — including the one a
 * listener reported as the wrong recitation.
 */
describe('years withheld for cause', () => {
  it('withholds the Makkah years that failed a check', () => {
    const gone = excludedYears('makkah')
    for (const y of [1416, 1430, 1443]) {
      expect(gone[y], `makkah ${y}`).toBeTruthy()
      expect(of('makkah').some((r) => r.year === y), `makkah ${y} must not ship`).toBe(false)
    }
  })

  it('withholds the Madinah years that failed a check', () => {
    const gone = excludedYears('madinah')
    for (const y of [1415, 1421, 1422, 1423, 1437, 1441, 1443]) {
      expect(gone[y], `madinah ${y}`).toBeTruthy()
      expect(of('madinah').some((r) => r.year === y), `madinah ${y} must not ship`).toBe(false)
    }
  })

  it('records a reason for every withheld year', () => {
    for (const m of PLACES) {
      for (const [year, why] of Object.entries(excludedYears(m.place))) {
        expect(String(why).length, `${m.place} ${year}`).toBeGreaterThan(15)
      }
    }
  })

  // The four years where the Madinah item holds the Makkah recording. An
  // independent copy settled 1441 — the shared audio is the Makkah one — so
  // the Makkah side is kept and the Madinah side withheld, not the reverse.
  it('keeps the Makkah side of the duplicated pairs', () => {
    for (const y of [1421, 1422, 1423, 1441]) {
      expect(of('makkah').some((r) => r.year === y), `makkah ${y}`).toBe(true)
      expect(of('madinah').some((r) => r.year === y), `madinah ${y}`).toBe(false)
    }
  })
})

describe('per-year attribution', () => {
  it('uses only ids the roster defines', () => {
    for (const place of ['makkah', 'madinah'] as Place[]) {
      for (const y of doc.mosques[place]) {
        for (const id of y.imams) {
          expect(roster[id], `${place} ${y.year} names "${id}"`).toBeDefined()
        }
      }
    }
  })

  /**
   * Two Makkah items and one Madinah item carry no names at all — their
   * description field holds a stray character or an English sentence. That is
   * a gap in the source, not a failure to match, so those years show no line
   * rather than an invented one. Pinned so a future rebuild that fills them in
   * says so instead of passing quietly.
   */
  it('names imams for every year the source describes', () => {
    const silent = all.filter((r) => imamsOf(r.group as Place, r.year!).length === 0)
    expect(silent.map((r) => r.id).sort()).toEqual(['haram-1414', 'haram-1419', 'nabawi-1432'])
  })

  /**
   * The items cross-list, in both directions: the Madinah 1440 description is
   * simply the Makkah roster — which is how Yasser Al-Dosari, who has never
   * led at the Prophet's Mosque, came to be named there — and two Makkah items
   * name Al-Budair, who is a Madinah imam.
   *
   * Naming a sheikh who was not in that city is the worst thing this data can
   * say, so an imam is only ever attributed to a mosque his roster entry says
   * he served at. Al-Juhany and Al-Muaiqly list both, because they genuinely
   * moved from the Prophet's Mosque to Makkah.
   */
  it('never attributes a year to an imam of the other mosque', () => {
    for (const r of all) {
      const place = r.group as Place
      for (const who of imamsOf(place, r.year!)) {
        const entry = Object.values(roster).find((x) => x.nameEn === who.nameEn)!
        expect(
          (entry as { serves?: string[] }).serves,
          `${r.id} names ${who.nameEn}`,
        ).toContain(place)
      }
    }
  })

  it('keeps the two men who led at both mosques available to both', () => {
    for (const id of ['juhany', 'muaiqly']) {
      expect((roster[id] as unknown as { serves: string[] }).serves.sort()).toEqual([
        'madinah',
        'makkah',
      ])
    }
  })

  /**
   * Two surnames belong to two different people each. Matching on the surname
   * alone put Abdurrahman As-Sudais in a Madinah year that names Ali As-Sudais,
   * and Khalid Al-Ghamdi in one that names Saad Al-Ghamdi.
   */
  it('tells apart the imams who share a surname', () => {
    expect(roster['sudais'].nameEn).not.toBe(roster['sudais-ali'].nameEn)
    expect(roster['ghamdi'].nameEn).not.toBe(roster['ghamdi-saad'].nameEn)
    for (const id of ['sudais', 'sudais-ali', 'ghamdi', 'ghamdi-saad']) {
      // Each must match on more than the shared surname.
      const m = (roster[id] as unknown as { match: string }).match
      expect(m.split(' ').length, id).toBeGreaterThan(1)
    }
  })

  /**
   * Madinah 1446 is served from a different item. The Nabawi1446 item holds
   * the uploader's sped-up variant — Al-Baqarah in 54 minutes rather than 107
   * — which is the whole recitation accelerated, not that year's Taraweeh.
   */
  it('serves Madinah 1446 at ordinary speed', () => {
    const y = doc.mosques.madinah.find((x) => x.year === 1446)
    expect(y, 'madinah 1446 must be published').toBeDefined()
    const hours = y!.secs.reduce((a, b) => a + b, 0) / 3600
    expect(hours).toBeGreaterThan(20)
    // Within a few per cent of its neighbour, rather than half of it.
    const prev = doc.mosques.madinah.find((x) => x.year === 1445)!
    expect(y!.secs[1] / prev.secs[1]).toBeGreaterThan(0.8)
  })

  // It would be far easier to paste one roster onto every year, and it would
  // be wrong. The two mosques have entirely different imams, and each changes
  // over thirty years.
  it('differs between the mosques and across the years', () => {
    const mk = imamsOf('makkah', 1447).map((w) => w.nameEn)
    const md = imamsOf('madinah', 1447).map((w) => w.nameEn)
    expect(mk).toContain('Bandar Baleela')
    expect(md).not.toContain('Bandar Baleela')
    expect(md.length).toBeGreaterThan(0)

    expect(imamsOf('makkah', 1428).map((w) => w.nameEn)).toContain('Saud Ash-Shuraim')
    expect(imamsOf('makkah', 1428).map((w) => w.nameEn)).not.toContain('Bandar Baleela')
  })
})

describe('the folded data file', () => {
  /**
   * The catalog's one-object-per-surah shape costs about 226 bytes each. 56
   * years is 6,384 surahs, so that shape here would add roughly 1.4 MB to a
   * file that ships inside the JS bundle and every visitor downloads before
   * the app paints. Only the byte count varies per surah — the URL is a pure
   * function of mosque, year and surah.
   *
   * This guards the saving: if someone expands the file back into objects,
   * this fails long before anyone notices the bundle got slower.
   */
  it('stays small enough to bundle', () => {
    expect(JSON.stringify(doc).length).toBeLessThan(140_000)
    expect(all.length * 114).toBeGreaterThan(6000)
  })

  it('stores a flat byte array per year, not surah objects', () => {
    for (const place of ['makkah', 'madinah'] as Place[]) {
      for (const y of doc.mosques[place]) {
        expect(y.bytes, `${place} ${y.year}`).toHaveLength(114)
        for (const b of y.bytes) expect(typeof b).toBe('number')
      }
    }
  })

  // Read from each item's own title rather than computed, because a Hijri
  // year straddles two Gregorian ones.
  it('carries the Gregorian year the source states', () => {
    const y = doc.mosques.makkah.find((x) => x.year === 1447)!
    expect(y.ce).toBe(2026)
  })
})

describe('arabicDigits', () => {
  // ١٤٤٧ rather than 1447, so a year sits correctly in the Arabic around it.
  it('renders a year in Arabic-Indic digits', () => {
    expect(arabicDigits(1447)).toBe('١٤٤٧')
    expect(arabicDigits(1414)).toBe('١٤١٤')
  })
})
