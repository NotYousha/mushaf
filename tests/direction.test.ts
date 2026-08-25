import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LANGS } from '../src/i18n'
import { stringsFor } from '../src/i18n'
import { isArabicScript } from '../src/i18n/script'

const css = readFileSync('src/ui/theme.css', 'utf8')

describe('interface direction', () => {
  it('marks exactly the Arabic-script languages as rtl', () => {
    for (const l of LANGS) {
      expect(l.dir, l.code).toBe(isArabicScript(l.code) ? 'rtl' : 'ltr')
      expect(stringsFor(l.code).dir, l.code).toBe(l.dir)
    }
  })

  /**
   * `.app { direction: rtl }` used to sit here, and it silently defeated the
   * entire language setting: the browser implements dir="ltr" through a
   * user-agent rule, and any author rule beats user-agent origin — so that one
   * line overrode the dir attribute on its own element and the app stayed
   * right-to-left in English, Hindi and French.
   *
   * Direction must come from the dir attribute, never from a rule on .app.
   */
  it('does not pin a direction on the app wrapper', () => {
    const block = /\.app\s*\{[\s\S]*?\}/.exec(css)?.[0] ?? ''
    expect(block.length).toBeGreaterThan(0)
    expect(block).not.toMatch(/^\s*direction:/m)
  })

  /**
   * Islands that are always Arabic regardless of the interface language —
   * scripture, mushaf page numbers, the fork drill — are allowed to pin a
   * direction. Everything else should use logical properties so it mirrors.
   * This keeps the count from creeping back up.
   */
  it('keeps pinned directions to the deliberate islands', () => {
    const pinned = css.match(/^\s*direction:\s*(rtl|ltr);/gm) ?? []
    // 16: the fourteen scripture and numeral islands; .controls-aux, pinned
    // for the same reason .controls is, since a transport reads left to right
    // in every language like a video scrubber; and the lock-screen diagnostic,
    // whose values are raw browser state rather than anything written in the
    // reader's language.
    expect(pinned.length).toBeLessThanOrEqual(16)
  })

  // These broke the main layout: a row that hugged the wrong edge, a search
  // field whose caret started on the wrong side.
  it('aligns the surah rows and the search field to the reader', () => {
    const names = /\.names\s*\{[\s\S]*?\}/.exec(css)?.[0] ?? ''
    expect(names).toMatch(/text-align:\s*start/)
    const search = /\.search input\s*\{[\s\S]*?\}/.exec(css)?.[0] ?? ''
    expect(search).toMatch(/text-align:\s*start/)
  })

  /**
   * A logical inset paired with a physical translate only centres in LTR: in
   * RTL `inset-inline-start` resolves to `right` and `translateX(-50%)` then
   * pushes the badge further off by its own width instead of back to centre.
   */
  it('centres the partial-download badge in both directions', () => {
    const rule = /\.mini-pct\s*\{[\s\S]*?\}/.exec(css)?.[0] ?? ''
    expect(rule).toMatch(/inset-inline-start/)
    expect(rule).not.toMatch(/transform:\s*translateX/)
  })
})

/**
 * The transport row. Eight controls across a phone overflowed it, and because
 * a flex item shrinks by default the round play button lost width while
 * keeping its height — it rendered as an oval. Both are pinned here: nothing
 * in the row may shrink, and the settings must stay out of it.
 */
describe('the transport row', () => {
  it('never lets a control shrink', () => {
    const ctrl = /\.ctrl\s*\{[\s\S]*?\}/.exec(css)?.[0] ?? ''
    expect(ctrl).toMatch(/flex:\s*none/)
    const big = /\.ctrl\.big\s*\{[\s\S]*?\}/.exec(css)?.[0] ?? ''
    expect(big).toMatch(/flex:\s*none/)
    expect(big).toMatch(/aspect-ratio:\s*1/)
  })

  it('keeps the settings in their own row', () => {
    expect(css).toMatch(/\.controls-aux\s*\{/)
  })

  // With no portrait the first grid column still claimed its gap, pushing the
  // title off centre and the empty ring off the edge of the screen.
  it('drops the portrait column when there is no portrait', () => {
    const rule = /\.player-top\.no-face\s*\{[\s\S]*?\}/.exec(css)?.[0] ?? ''
    expect(rule).toMatch(/grid-template-columns:\s*1fr auto/)
  })
})
