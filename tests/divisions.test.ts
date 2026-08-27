import { describe, it, expect } from 'vitest'
import {
  PAGES,
  juz,
  hizbs,
  rubs,
  hizbsOfJuz,
  rubsOfHizb,
  juzOfPage,
  hizbOfPage,
  juzOfSurah,
  pagesOfJuz,
  surahOfPage,
  surahPage,
  surahsOfJuz,
  surahsOnPage,
} from '../src/mushaf/divisions'
import layout from '../data/mushaf-layout.json'

/**
 * The divisions are generated, and generated data is exactly the kind that
 * looks right and is not. These check it against two things it was not built
 * from: the page layout, and the printed mushaf.
 */
describe('mushaf divisions', () => {
  it('covers all 604 pages', () => {
    expect(PAGES).toBe(604)
  })

  it('has thirty juz, sixty hizb and two hundred and forty quarters', () => {
    expect(juz).toHaveLength(30)
    expect(hizbs).toHaveLength(60)
    expect(rubs).toHaveLength(240)
  })

  it('starts each juz on the page a printed Madani mushaf starts it', () => {
    // The other half of the check the build script runs. Stated here too
    // because the build only runs when someone regenerates the file, and
    // this runs on every commit.
    const printed = [
      1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282,
      302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562,
      582,
    ]
    expect(juz.map((j) => j.page)).toEqual(printed)
  })

  it('starts every division on an ayah the layout actually prints there', () => {
    // Independent of the verse metadata the divisions came from: the layout
    // is a different file, built from the words on the page.
    const pageOf = new Map<string, number>()
    const pages = (layout as unknown as { pages: { w: [string, string?][] }[][] })
      .pages
    pages.forEach((lines, i) => {
      for (const line of lines) {
        for (const w of line.w) {
          if (w[1] && !pageOf.has(w[1])) pageOf.set(w[1], i + 1)
        }
      }
    })
    for (const d of [...juz, ...hizbs, ...rubs]) {
      expect(pageOf.get(`${d.start}:1`), `${d.start}`).toBe(d.page)
    }
  })

  it('gives each juz exactly two hizbs and each hizb four quarters', () => {
    for (let n = 1; n <= 30; n++) expect(hizbsOfJuz(n)).toHaveLength(2)
    for (let n = 1; n <= 60; n++) expect(rubsOfHizb(n)).toHaveLength(4)
  })

  it('runs the juz consecutively with no page in two of them', () => {
    let expected = 1
    for (let n = 1; n <= 30; n++) {
      const [first, last] = pagesOfJuz(n)
      expect(first).toBe(expected)
      expect(last).toBeGreaterThanOrEqual(first)
      expected = last + 1
    }
    expect(expected - 1).toBe(PAGES)
  })

  it('agrees with the reference app on where 4:173 is', () => {
    // An-Nisa, page 105, juz 6, hizb 11 — a whole verse of navigation
    // metadata taken from a screenshot of another mushaf app, and every
    // part of it has to match or ours is naming the reader's place wrongly.
    expect(surahPage(4)).toBe(77)
    expect(juzOfPage(105)).toBe(6)
    expect(hizbOfPage(105)).toBe(11)
    expect(surahOfPage(105)).toBe(4)
  })

  it('names the later surah where a page carries two', () => {
    // Page 106 opens with the end of An-Nisa and begins Al-Ma'idah.
    expect(surahsOnPage(106)).toEqual([4, 5])
    expect(surahOfPage(106)).toBe(5)
  })

  it('files a surah under the juz it starts in, once', () => {
    expect(juzOfSurah(1)).toBe(1)
    expect(juzOfSurah(2)).toBe(1)
    // Al-Baqarah runs through juz 3 but is filed only under 1.
    expect(juzOfSurah(3)).toBe(3)
    expect(juzOfSurah(114)).toBe(30)
  })

  it('lists the surah a juz opens partway through', () => {
    // Nothing begins in juz 2; it is the middle of Al-Baqarah, and a heading
    // with nothing under it would be a bug the reader sees.
    expect(surahsOfJuz(2)).toEqual([2])
    expect(surahsOfJuz(1)).toEqual([1, 2])
  })

  it('starts every surah on a page inside its juz', () => {
    for (let s = 1; s <= 114; s++) {
      const p = surahPage(s)
      expect(p).toBeGreaterThanOrEqual(1)
      expect(p).toBeLessThanOrEqual(PAGES)
      expect(surahsOnPage(p)).toContain(s)
    }
  })
})
