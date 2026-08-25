import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Urdu is written in the Arabic script and is not Arabic.
 *
 * A naskh face renders it without complaint, which is why the interface
 * looked finished while reading wrong to anyone who actually reads Urdu:
 * Urdu is set in nastaliq, which slopes down from right to left. The letters
 * were right and the language looked wrong.
 *
 * What must not happen is nastaliq reaching the Quran. The mushaf is set in
 * Amiri against the printed page it imitates, and no interface language may
 * change that.
 */

const css = readFileSync('src/ui/theme.css', 'utf8')
const fonts = readFileSync('public/fonts/fonts.css', 'utf8')

describe('Urdu typography', () => {
  it('serves nastaliq from this origin, like every other face', () => {
    // font-src is 'self'; a Google Fonts link would simply be blocked.
    expect(fonts).toContain("font-family: 'Noto Nastaliq Urdu'")
    const urls = [...fonts.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1])
    for (const u of urls) expect(u.startsWith('./')).toBe(true)
  })

  it('changes the interface face for Urdu and nothing else', () => {
    const block = /:root\[lang='ur'\]\s*\{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(block).toContain('--font-ui')
    // Scripture and surah names ride on these two. If Urdu ever redefines
    // them, the mushaf stops being set in Amiri.
    expect(block).not.toContain('--font-quran')
    expect(block).not.toContain('--font-ar:')
  })

  it('never sets the mushaf or a surah name in the interface face', () => {
    for (const sel of ['.ayah', '.name-ar', '.mushaf-basmala', '.imam-r-ar', '.fav-ar']) {
      const rule = new RegExp(`^\${sel}\s*\{[^{}]*\}`, 'm').exec(css)?.[0] ?? ''
      expect(rule, sel).not.toContain('--font-ui')
      expect(rule, sel).not.toContain('Nastaliq')
    }
  })

  it('keeps letter-spacing off anything that can hold Arabic', () => {
    /*
     * Arabic and Urdu are cursive. Spacing the letters apart breaks the joins
     * between them and leaves a row of disconnected shapes — so any rule that
     * tracks text has to be behind a Latin-only guard. This caught three that
     * were not: a surah heading on the mushaf page, the wordmark's second
     * line, and a section label.
     */
    const offenders: string[] = []
    for (const m of css.matchAll(/(?<sel>[^{}]+)\{(?<body>[^{}]*letter-spacing[^{}]*)\}/g)) {
      const sel = m.groups!.sel.trim().split('\n').pop()!.trim()
      // Already behind a Latin-only guard, which is the point of the rule.
      if (sel.includes("[dir='ltr']")) continue
      // These hold Latin in every language: a percentage, an English-only
      // diagnostic heading.
      if (['.mini-pct', '.diag-h'].includes(sel)) continue
      offenders.push(sel)
    }
    expect(offenders).toEqual([])
  })
})
