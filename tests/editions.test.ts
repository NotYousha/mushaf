import { describe, it, expect } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import {
  DEFAULT_EDITION,
  EDITIONS,
  FAMILIES,
  UNAVAILABLE,
  editionById,
  editionsIn,
} from '../src/mushaf/editions'
import { runs, type Span } from '../src/mushaf/tajweed'
import { editions, defaultEdition } from '../src/ui/editions'

describe('the mushaf editions', () => {
  it('always offers at least the bundled mushaf', () => {
    // The onboarding step reads this list and has no feature check, so an
    // empty registry would give a first-time reader a step with no choices.
    expect(EDITIONS.length).toBeGreaterThan(0)
    expect(editionById(DEFAULT_EDITION).id).toBe(DEFAULT_EDITION)
  })

  it('falls back to the first edition rather than to undefined', () => {
    // A stored preference can name an edition that has since been removed.
    expect(editionById('a-mushaf-we-dropped').id).toBe(EDITIONS[0].id)
  })

  it('gives every edition both scripts and a family the picker shows', () => {
    for (const e of EDITIONS) {
      expect(e.name, e.id).toBeTruthy()
      expect(e.nameAr, e.id).toBeTruthy()
      expect(e.description, e.id).toBeTruthy()
      expect(e.descriptionAr, e.id).toBeTruthy()
      expect(FAMILIES, e.id).toContain(e.family)
      expect(['juz', 'para'], e.id).toContain(e.unitWord)
    }
  })

  it('uses ids that are unique and safe to store', () => {
    const ids = EDITIONS.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })

  it('ships no edition that would silently lose word following', () => {
    /*
     * The one promise this screen makes.
     *
     * Every other Quran app offers page scans and lets the reader discover
     * afterwards that the page has gone quiet — no word highlighting, no
     * search, nothing read aloud. Nothing here is a scan. When an edition
     * that can only be pictures is genuinely wanted, this test is where the
     * argument has to be had.
     */
    for (const e of EDITIONS) expect(e.kind, e.id).toBe('text')
  })

  it('says why each missing edition is missing', () => {
    for (const family of FAMILIES) {
      for (const m of UNAVAILABLE[family]) {
        expect(m.name).toBeTruthy()
        expect(['no-source', 'needs-permission', 'buildable']).toContain(m.reason)
      }
    }
    /*
     * IndoPak is the one people ask for, and its blocker used to be a font
     * licence somebody had to write an email about — recorded here so it could
     * not quietly vanish from the list of things we owed.
     *
     * It did not vanish; it was paid. The permission-blocked face was routed
     * around with KFGQPC Nastaleeq, whose own licence grants distribution
     * provided the font is not modified, and IndoPak 15-line ships. So the
     * guard moves with the debt: what must not quietly vanish now is the
     * edition itself.
     */
    expect(EDITIONS.map((e) => e.id)).toContain('indopak-15')
    expect(UNAVAILABLE.indopak.every((m) => m.reason !== 'needs-permission')).toBe(true)
  })

  it('gives the IndoPak family the word Para when it lands', () => {
    // Nothing ships in it yet, so this guards the rule rather than a row: an
    // IndoPak edition that called the thirtieth a juz would be wrong to the
    // readers it exists for.
    for (const e of editionsIn('indopak')) expect(e.unitWord).toBe('para')
  })

  it('presents the same registry to the first-run flow', () => {
    // src/ui/editions.ts is a view onto this one. If it drifts, someone gets
    // a different set of mushafs on their first run than in the picker.
    expect(editions().map((e) => e.id)).toEqual(EDITIONS.map((e) => e.id))
    expect(defaultEdition()).toBe(DEFAULT_EDITION)
  })
})

describe('tajweed colouring', () => {
  it('leaves a word with no rules as one run', () => {
    expect(runs('كتاب', undefined)).toEqual([{ text: 'كتاب', rule: undefined }])
    expect(runs('كتاب', [])).toEqual([{ text: 'كتاب', rule: undefined }])
  })

  it('cuts a word into coloured and uncoloured runs', () => {
    const out = runs('abcdef', [['q', 2, 4]])
    expect(out).toEqual([
      { text: 'ab', rule: undefined },
      { text: 'cd', rule: 'q' },
      { text: 'ef', rule: undefined },
    ])
    // Every character survives: the word on the page must not change length.
    expect(out.map((r) => r.text).join('')).toBe('abcdef')
  })

  it('lets the later rule win where two overlap', () => {
    // A letter can carry one colour. The printed mushafs mark the more
    // specific rule, which is the one written last in the source.
    expect(runs('abcd', [['m2', 0, 4], ['h', 1, 2]])).toEqual([
      { text: 'a', rule: 'm2' },
      { text: 'b', rule: 'h' },
      { text: 'cd', rule: 'm2' },
    ])
  })

  it('ignores a span that runs past the end of the word', () => {
    // Spans are clipped to word bounds when the data is built, but a word is
    // rendered from the layout and the spans come from a separate file — a
    // mismatch must not throw or lose characters.
    const out = runs('ab', [['q', 1, 99] as unknown as Span[number]] as unknown as Span[])
    expect(out.map((r) => r.text).join('')).toBe('ab')
  })
})

describe('the tajweed data', () => {
  const file = 'public/tajweed.json'

  it('is served rather than bundled', () => {
    // 1.3 MB. Bundling it would charge every reader for an edition most of
    // them will never open.
    expect(statSync(file).size).toBeGreaterThan(1_000_000)
    const app = readFileSync('src/mushaf/tajweed.ts', 'utf8')
    expect(app).toContain('fetch(')
    expect(app).not.toContain("from '../../public")
  })

  it('keys every entry the way the page layout keys its words', () => {
    const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Span[]>
    const layout = JSON.parse(readFileSync('data/mushaf-layout.json', 'utf8')) as {
      pages: { w: [string, string?][] }[][]
    }
    const known = new Map<string, number>()
    for (const lines of layout.pages) {
      for (const line of lines) {
        for (const w of line.w) if (w[1]) known.set(w[1], w[0].trim().length)
      }
    }
    const keys = Object.keys(data)
    expect(keys.length).toBeGreaterThan(40_000)

    const unknown: string[] = []
    const outside: string[] = []
    for (const [key, spans] of Object.entries(data)) {
      const len = known.get(key)
      if (len === undefined) {
        unknown.push(key)
        continue
      }
      // A span outside the word would colour nothing, or throw off a
      // renderer that trusted it. Both are silent on screen.
      for (const [, start, end] of spans) {
        if (start < 0 || end > len || start >= end) outside.push(`${key} ${start}-${end}/${len}`)
      }
    }
    expect(unknown.slice(0, 5)).toEqual([])
    expect(outside.slice(0, 5)).toEqual([])
  })
})
