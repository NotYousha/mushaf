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
    expect(pinned.length).toBeLessThanOrEqual(14)
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
