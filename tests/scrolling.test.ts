import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * `content-visibility` is a promise about layout, and the browser believes it.
 *
 * Telling it to skip what is off screen means telling it how much room to
 * leave, and if that number is wrong the list claims a scroll length it does
 * not have and shrinks as the real rows are laid out. That shipped: the surah
 * row reserved `auto 4.6rem` while the row was 64px, and because
 * `contain-intrinsic-size` names the *content* box of a border-box element
 * with 1.4rem of vertical padding, the reserved figure was 96px — 32px too
 * tall, on each of the eighty-odd rows below the fold. The list opened
 * claiming 10034px of scroll, ended at 7378px, and surah 114 travelled 2624px
 * upward under the reader's thumb in jumps of a full row while they chased it.
 *
 * The number could not have been right for everyone. A row grows an English
 * gloss only in English and a reciter's name only on a multi-voice Taraweeh
 * year, so measured at 390px it is 63.97px (Arabic or Urdu mushaf), 77.28px
 * (English mushaf), 78.88px, 81.63px or 96.28px — and 4.6rem is the English
 * Taraweeh figure to within a third of a pixel. It was true on the screen it
 * was taken from and then asked to hold for five others.
 *
 * So the rule is not "use the right constant". It is that a reserved height
 * must either be measured from the thing it describes, or belong to a box
 * whose size never depended on its contents in the first place.
 */

const read = (p: string) => readFileSync(p, 'utf8')
const motion = read('src/ui/motion.css')
const theme = read('src/ui/theme.css')
const list = read('src/ui/SurahList.tsx')

/** The body of the first rule whose selector matches, comments stripped. */
function rule(css: string, selector: string) {
  const at = css.indexOf(`\n${selector} {`)
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1)
  const open = css.indexOf('{', at)
  return css.slice(open + 1, css.indexOf('}', open)).replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('the surah list reserves a height it measured', () => {
  it('never writes the row height down as a constant', () => {
    const body = rule(motion, '.surah-list .row')
    expect(body).toContain('content-visibility: auto')
    // The fallback after the comma is allowed to be a length — it covers the
    // single frame before the measurement lands — but the value the browser
    // uses once the list is up has to come from the list itself.
    expect(body, 'the row height must come from --row-h, not a literal').toMatch(
      /contain-intrinsic-size:\s*auto\s+var\(--row-h/,
    )
  })

  it('measures the content box, which is what the property asks for', () => {
    expect(list).toContain('--row-h')
    // The original bug was not only a stale number: 4.6rem was reserved on top
    // of the row's own padding, because contain-intrinsic-size sizes the
    // content box while the row is border-box. Subtracting the padding is the
    // half of this that is easy to drop.
    expect(list).toMatch(/paddingTop/)
    expect(list).toMatch(/paddingBottom/)
    expect(list).toMatch(/getBoundingClientRect\(\)\.height/)
  })

  it('re-measures rather than trusting the first paint', () => {
    // The Arabic face arrives after first paint and the row grows when it
    // does, so a single measurement at mount pins the fallback font's height.
    expect(list).toContain('ResizeObserver')
  })
})

describe('content-visibility is only used where the size is safe', () => {
  it('is declared on exactly the two places that have earned it', () => {
    const selectors = new Set<string>()
    // Every selector in the app's CSS that asks the browser to skip contents.
    for (const file of ['motion.css', 'theme.css', 'glass.css', 'home.css', 'desktop.css', 'themes.css']) {
      const css = read(`src/ui/${file}`).replace(/\/\*[\s\S]*?\*\//g, '')
      for (const m of css.matchAll(/([^{}]+)\{([^}]*content-visibility\s*:\s*auto[^}]*)\}/g)) {
        selectors.add(m[1].trim())
      }
    }
    /*
     * A new entry here is not a style change, it is a claim that the browser
     * can skip an element's contents without getting its size wrong. Anything
     * whose height comes from the text inside it needs a measured reservation
     * the way the surah row does; adding one without that is how the list
     * started retreating under the reader.
     */
    expect([...selectors].sort()).toEqual(['.heat-cell', '.surah-list .row'])
  })

  it('leaves the mushaf map alone, because its cells cannot change size', () => {
    // 604 cells, and the strongest case in the app for skipping them — a heat
    // cell is a grid item in a fixed 28-column track with aspect-ratio 1, so
    // its height follows the column width and never its contents. Measured
    // with content-visibility on and off, every cell is 9.61px either way.
    expect(rule(motion, '.heat-cell')).toContain('content-visibility: auto')
    expect(rule(motion, '.heat-cell')).not.toContain('contain-intrinsic-size')
    const cell = rule(theme, '.heat-cell')
    expect(cell, 'the heat cell only stays stable while it is a square').toContain('aspect-ratio: 1')
    expect(rule(theme, '.heat')).toContain('grid-template-columns: repeat(28, 1fr)')
  })
})
