import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Arabic and Urdu are drawn outside the line box, and `overflow: hidden` does
 * not know that.
 *
 * A vocalised surah name puts a shadda-and-damma stack about 9px above its own
 * line box at 25px, and a kasra 4px below it. Every rule in this app that
 * truncates a name with an ellipsis therefore also clips those marks, because
 * CSS has no way to clip on one axis: ask for `overflow-x: hidden` and the
 * other axis silently becomes `auto`. This shipped on the surah list — all 114
 * rows of it — where سُورَةُ النُّورِ lost its damma and سُورَةُ الحَجِّ had
 * its kasra sliced flat, and on the player sheet's title.
 *
 * The remedy is not more leading. Raising line-height on the list row would
 * have added seven hundred pixels of scroll to solve a painting problem. It is
 * to move the clip edge outward with padding and give the layout the same
 * distance back as a negative margin, so the marks paint into whitespace the
 * row already had.
 *
 * The two halves must stay equal. Half of this pair is a silent layout shift
 * on every row of the longest list in the app, which is why it is checked here
 * rather than left to be noticed.
 */

const read = (p: string) => readFileSync(p, 'utf8')
const theme = read('src/ui/theme.css')
const home = read('src/ui/home.css')

/** The body of the first rule whose selector matches, comments stripped. */
function rule(css: string, selector: string) {
  const at = css.indexOf(`\n${selector} {`)
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1)
  const open = css.indexOf('{', at)
  return css.slice(open + 1, css.indexOf('}', open)).replace(/\/\*[\s\S]*?\*\//g, '')
}

/** The body of an @media block, by the condition written in it. */
function media(css: string, condition: string) {
  const at = css.indexOf(`@media ${condition}`)
  expect(at, `no @media ${condition}`).toBeGreaterThan(-1)
  let depth = 0
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(at, i)
  }
  throw new Error(`unterminated @media ${condition}`)
}

const decl = (body: string, prop: string) =>
  new RegExp(String.raw`(?:^|[;{\s])` + prop + String.raw`\s*:\s*([^;]+)`).exec(body)?.[1]?.trim()

/** Everything that truncates a name with an ellipsis, and where it lives. */
const CLIPPERS: [string, string, string][] = [
  ['theme.css', '.name-ar', theme],
  ['theme.css', '.now .surah-name', theme],
  ['theme.css', '.theme-of', theme],
  ['home.css', '.face-cell-name', home],
]

describe('a clipped box leaves room for the marks above and below it', () => {
  for (const [file, selector, css] of CLIPPERS) {
    it(`${selector} in ${file} buys its clip room back`, () => {
      const body = rule(css, selector)
      expect(body, 'this test only applies to rules that clip').toMatch(/overflow:\s*(hidden|clip)/)

      const pad = decl(body, 'padding-block')
      const margin = decl(body, 'margin-block')
      expect(pad, `${selector} clips without reserving room for a descender`).toBeTruthy()
      expect(margin, `${selector} reserves room without giving the layout it back`).toBeTruthy()
      // Equal and opposite, or the row silently changes height.
      expect(`-${pad}`, `${selector}: the padding and the margin have drifted apart`).toBe(margin)
    })
  }

  /*
   * A negative margin between two blocks collapses with its neighbour's:
   * the larger of the two wins instead of both applying. .name-ar sits above
   * .name-plain, which already pulls itself up by 0.1rem, so as a block
   * container the pair produced one offset rather than two and every English
   * row grew by the difference. Grid items do not collapse.
   */
  for (const selector of ['.names', '.verify-names']) {
    it(`${selector} does not let that margin collapse into the gloss below`, () => {
      expect(rule(theme, selector), `${selector} must not be a block container`).toMatch(
        /display:\s*(grid|flex)/,
      )
    })
  }

  /*
   * The player's fold is a grid animating 1fr to 0fr, so .player-fold-inner
   * (motion.css) has to clip — that is what it is for. The surah name is the
   * first thing inside it, and its marks were landing 4.6px outside. The row
   * starts lower rather than the fold being asked to stop clipping.
   */
  it('the player title starts below the fold that clips it', () => {
    const body = rule(theme, '.player-top')
    const pad = decl(body, 'padding-block-start')
    expect(pad, '.player-top must keep headroom for the title above it').toBeTruthy()
    expect(parseFloat(pad!), 'less than 0.35rem and the damma is cut again').toBeGreaterThanOrEqual(
      0.35,
    )
  })
})

/**
 * A flex item's automatic minimum size is its own intrinsic width, and `flex:
 * 1` sets the basis without touching that floor. An <input> asks for about
 * twenty characters, so the search field refused to shrink below 331px inside
 * a 238px pill; the overflow propagated out to .scroll and the whole "See all"
 * screen could be dragged 64px sideways on a 320px phone.
 */
describe('the search field can shrink to the pill it sits in', () => {
  it('gives the input a zero minimum', () => {
    expect(rule(theme, '.search input')).toMatch(/min-(width|inline-size):\s*0/)
  })
})

/**
 * The reciter grid is sized as a share of the row on purpose: four fixed cells
 * and their gaps came to 394px on a 390px phone, which widened the scroller
 * and pushed the logo and the first dock tab off the edge. The narrow-phone
 * media query then restated a fixed 4.9rem cell and re-created the same bug
 * one screen size down — at 320px the track is 71.6px and the cell insisted on
 * 78.4px, so the third column ran past the card.
 */
describe('a portrait cell is a share of its row at every width', () => {
  it('never states a cell width that the track has to obey', () => {
    const narrow = media(home, '(max-width: 360px)').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(narrow, 'the cell may be capped, but not sized').not.toMatch(
      /\.face-grid li\s*\{[^}]*(?<!max-)inline-size:/,
    )
    expect(narrow, 'the portrait follows the cell; it needs no size of its own').not.toMatch(
      /\.face-round\s*\{/,
    )
  })
})

/**
 * Caret, name, "2 surahs · 89 MB" and a "Delete all" button do not fit across
 * a phone. .dl-name was the only item in that row with `overflow: hidden`, so
 * it was the only one whose automatic minimum was zero — and it lost every
 * argument: 75px of "Yasser Al-Dosari" at 390px, 5px of it at 320px. The row
 * that exists so someone can decide whose two gigabytes to delete would not
 * say whose.
 */
describe('the downloads row says whose audio it is', () => {
  it('lets the name take the space and the figure take the line below', () => {
    expect(rule(theme, '.dl-title'), 'the row has to be allowed a second line').toMatch(
      /flex-wrap:\s*wrap/,
    )
    const name = rule(theme, '.dl-name')
    expect(name, '.dl-name must grow rather than only shrink').toMatch(/flex:\s*1\s/)
    expect(name).toMatch(/min-inline-size:\s*0/)
    expect(rule(theme, '.dl-meta'), 'the count and size belong under the name').toMatch(
      /flex:\s*1\s+1\s+100%/,
    )
  })
})
