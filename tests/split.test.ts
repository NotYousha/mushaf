import { describe, it, expect } from 'vitest'
import { listSide, splits } from '../src/ui/SplitView'
import { LANGS } from '../src/i18n'

describe('splits', () => {
  it('splits on a tablet and a desktop, and never on a phone', () => {
    expect(splits('phone')).toBe(false)
    expect(splits('tablet')).toBe(true)
    expect(splits('desktop')).toBe(true)
  })

  /*
   * A television is one pane and always will be. Two columns at ten feet means
   * neither is legible, and a remote has no way to move between them that is
   * better than a single focused list.
   */
  it('never splits a television', () => {
    expect(splits('tv')).toBe(false)
  })

  /*
   * Inside a wrapper the platform owns the chrome, and the native shell is a
   * phone in every case that ships today. Splitting there would put two panes
   * under a tab bar sized for one.
   */
  it('never splits a native shell', () => {
    expect(splits('native')).toBe(false)
  })
})

describe('listSide', () => {
  it('puts the list where the reading starts', () => {
    expect(listSide('ltr')).toBe('start')
    expect(listSide('rtl')).toBe('start')
  })

  /*
   * The point of the logical value: `start` is the left edge in English and the
   * right edge in Arabic, so one rule serves all five languages and no mirrored
   * stylesheet is needed. This asserts the app has a direction for each of them
   * at all, which is the thing that would actually break.
   */
  it('has a direction for every language the picker offers', () => {
    for (const l of LANGS) {
      expect(['rtl', 'ltr'], l.code).toContain(l.dir)
      expect(listSide(l.dir), l.code).toBe('start')
    }
  })
})
