import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Five sizes, and a floor of 12.8px.
 *
 * The app once carried thirty-six font sizes, twenty of them between 0.55 and
 * 0.95rem with gaps of a third of a pixel — differences nobody reads as
 * hierarchy, only as two things that were meant to match and don't. It also
 * shipped meaningful text at 8.8px, including which riwayah a listener is
 * hearing. --text-xs through --text-xl exist to end both of those, and the
 * only way a scale stays a scale is if new rules have to join it.
 *
 * Scripture is exempt and always will be: the mushaf's own text, an ayah, the
 * basmala and the fork drill are sized against the page they imitate rather
 * than against a user-interface scale. The crash screen is exempt because it
 * has to render when the thing that broke might be the theme itself, so it
 * refers to no token at all. The list below is the whole of the exemption; a
 * new entry is a claim, not a formatting choice.
 */

const FILES = ['theme.css', 'home.css'] as const

const EXEMPT = new Set([
  // Scripture, sized against the printed page.
  '.ayah',
  '.ayah-num',
  '.ayah-mark',
  '.mushaf-line',
  '.mushaf-basmala',
  // The ayah in the translation view. Scripture again, and sized against the
  // same printed page — it is the mushaf's own text lifted out of the page
  // and set as a document, not an interface string that happens to be large.
  '.tayah-ar',
  // The two lines of mushaf drawn in a Choose Mushaf card's thumbnail. Also
  // scripture, sized against the page it is a picture of — the card has to
  // fit a real line of the real font into eight rems.
  '.pp-line',
  /*
   * The leaf itself, whose font-size is the root the whole page scales from:
   * calc(--fit * --zoom * 1rem), fitted to the measure by MushafView rather
   * than chosen from a scale. This exemption used to be spelled
   * `.mushaf-page`, which nothing has rendered for some time — the class was
   * renamed and the list was not, so the leaf lost its exemption and the cap
   * on its measure in one go.
   */
  '.mpages',
  // The fork drill, which sets the Quran in its own measure.
  '.fork-text',
  '.fork-cue',
  '.fork-cue.is-yours',
  // Theme-independent by design: it must draw when the theme cannot.
  '.crash h1',
  '.crash-msg',
  '.crash-actions button',
  '.crash-note',
  /*
   * The one documented exception on the scale itself. A dock label in Urdu is
   * nastaliq, which is unreadable at the size Latin tolerates, and the tab bar
   * cannot grow — 0.74rem is the smallest this can honestly be set and the
   * rule beside it says so.
   */
  ":root[lang='ur'] .dock-tab",
])

function rawSizes(css: string) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const found: { selector: string; value: string }[] = []
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().split(/\s+/).join(' ')
    for (const d of m[2].matchAll(/font-size\s*:\s*([^;]+);/g)) {
      const value = d[1].trim()
      if (value.includes('var(--text-') || value === 'inherit') continue
      found.push({ selector, value })
    }
  }
  return found
}

/**
 * Which exemption, if any, covers a selector.
 *
 * Matched on the rightmost simple selector as well as the whole string,
 * because the element carrying the font-size is the one at the end: when
 * `.mushaf-line` became `.mpage-lines .mushaf-line` it was still the same line
 * of the same mushaf, but an exact-string check called it a new offender and
 * called the old entry an orphan in the same run. That has now happened twice
 * — `.mushaf-page` was the first — and it is nesting, not a new size.
 */
const exemptedBy = (selector: string): string | null => {
  if (EXEMPT.has(selector)) return selector
  const last = selector.split(/\s+/).pop() ?? selector
  return EXEMPT.has(last) ? last : null
}

describe('the type scale', () => {
  it('states five steps and nothing under 12.8px', () => {
    const root = readFileSync('src/ui/theme.css', 'utf8')
    const steps = [...root.matchAll(/--text-(xs|sm|md|lg|xl):\s*([\d.]+)rem/g)]
    expect(steps.map((s) => s[1])).toEqual(['xs', 'sm', 'md', 'lg', 'xl'])
    const rem = steps.map((s) => Number(s[2]))
    expect(Math.min(...rem) * 16, 'the smallest step is the floor').toBeGreaterThanOrEqual(12.8)
    // Ascending, and far enough apart to be read as different.
    for (let i = 1; i < rem.length; i++) expect(rem[i] / rem[i - 1]).toBeGreaterThan(1.2)
  })

  it('is the only place an interface size comes from', () => {
    const offenders: string[] = []
    for (const file of FILES) {
      for (const { selector, value } of rawSizes(readFileSync(`src/ui/${file}`, 'utf8'))) {
        if (!exemptedBy(selector)) offenders.push(`${file}: ${selector} { font-size: ${value} }`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the exemption list honest', () => {
    // An entry that no longer names a real rule is an entry nobody is
    // checking; it should come off the list rather than sit there granting
    // permission to whatever takes that selector next.
    const used = new Set<string>()
    for (const file of FILES) {
      for (const { selector } of rawSizes(readFileSync(`src/ui/${file}`, 'utf8'))) {
        // Credit the entry that actually covered it, so an exemption still
        // counts as used once its rule is nested inside something else.
        const by = exemptedBy(selector)
        if (by) used.add(by)
      }
    }
    expect([...EXEMPT].filter((s) => !used.has(s))).toEqual([])
  })
})
