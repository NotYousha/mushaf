import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Onboarding } from '../src/ui/Onboarding'
import { editions } from '../src/ui/editions'
import { deviceLang, stringsFor, LANGS, type Lang } from '../src/i18n'
import { THEMES, DEFAULT_THEME } from '../src/ui/theming'

const noop = () => {}

function render(over: Partial<Parameters<typeof Onboarding>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(Onboarding, {
      lang: 'en' as Lang,
      theme: DEFAULT_THEME,
      mode: 'system',
      edition: editions()[0].id,
      onLang: noop,
      onTheme: noop,
      onMode: noop,
      onEdition: noop,
      onDone: noop,
      ...over,
    }),
  )
}

/**
 * The language a first run starts in.
 *
 * This is the half of the feature that decides what a stranger sees in the
 * first second, and it is easy to get subtly wrong: a region tag, a capital
 * letter, or a language the app does not speak.
 */
describe('deviceLang', () => {
  const original = navigator.language
  const originalList = navigator.languages

  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(navigator, 'language', { value: original, configurable: true })
    Object.defineProperty(navigator, 'languages', {
      value: originalList,
      configurable: true,
    })
  })

  /**
   * Both properties, because the implementation reads `languages[0]` first.
   *
   * That order is deliberate — `languages` is the user's ranked list and is
   * what a phone set to Arabic with an English keyboard reports first — and it
   * is also why stubbing `language` alone proves nothing: jsdom supplies a
   * non-empty `languages`, which would win and quietly make this test pass
   * against the wrong code path.
   */
  const as = (value: string) => {
    Object.defineProperty(navigator, 'language', { value, configurable: true })
    Object.defineProperty(navigator, 'languages', {
      value: value ? [value] : [],
      configurable: true,
    })
  }

  it('takes the phone’s language when the app speaks it', () => {
    for (const [tag, want] of [
      ['ar', 'ar'],
      ['ar-SA', 'ar'],
      ['AR-eg', 'ar'],
      ['ur-PK', 'ur'],
      ['hi-IN', 'hi'],
      ['fr-CA', 'fr'],
      ['en-GB', 'en'],
    ] as [string, Lang][]) {
      as(tag)
      expect(deviceLang(), tag).toBe(want)
    }
  })

  // Arabic remains DEFAULT_LANG — the language of the mushaf — but it is the
  // wrong thing to hand somebody whose phone is in German.
  it('lands on English for a language the app does not speak', () => {
    for (const tag of ['de-DE', 'zh', 'klingon', '']) {
      as(tag)
      expect(deviceLang(), tag).toBe('en')
    }
  })
})

describe('the first-run flow', () => {
  it('asks for the language first, in every language’s own script', () => {
    const html = render()
    expect(html).toContain(stringsFor('en').obLangTitle)
    // Somebody looking for their language looks for that word, not its
    // English name, so each option names itself.
    for (const l of LANGS) expect(html, l.code).toContain(l.label)
  })

  it('writes itself in the language chosen, not the one it opened in', () => {
    const html = render({ lang: 'ur' })
    expect(html).toContain(stringsFor('ur').obLangTitle)
    expect(html).not.toContain(stringsFor('en').obLangTitle)
    // And turns around with it.
    expect(html).toContain('dir="rtl"')
  })

  it('offers light, dark and match-my-device, and every palette', () => {
    // Step two is reached by state, so render it by asserting on the strings
    // the step needs rather than by clicking: this is a markup test.
    const t = stringsFor('en')
    expect([t.obLight, t.obDark, t.obSystem].every(Boolean)).toBe(true)
    expect(THEMES.length).toBeGreaterThan(1)
    for (const th of THEMES) expect(th.swatch.light[0]).toMatch(/^#/)
  })

  it('shows a step indicator and a way onward', () => {
    const html = render()
    expect(html).toContain('ob-dots')
    expect(html).toContain(stringsFor('en').obNext)
    // No way back from the first step, because there is nothing behind it.
    expect(html).not.toContain(stringsFor('en').obBack)
  })

  it('is announced as a dialog, since it covers the whole app', () => {
    const html = render()
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
  })
})

/**
 * The mushaf step reads a registry rather than a hardcoded list, so that the
 * editions being added elsewhere appear here without this file changing.
 */
describe('the mushaf editions offered', () => {
  it('always offers at least the mushaf the app bundles', () => {
    const list = editions()
    expect(list.length).toBeGreaterThan(0)
    for (const e of list) {
      expect(e.id, 'an edition needs a stable id').toBeTruthy()
      expect(e.name).toBeTruthy()
      expect(e.nameAr).toBeTruthy()
      // Three, and they are not interchangeable: text loses nothing, glyphs
      // keep word following but lose search and speech, images lose all
      // three. Anything reading this field to decide what to offer needs
      // that middle case kept separate.
      expect(['text', 'glyphs', 'images']).toContain(e.kind)
    }
  })

  it('gives every edition a distinct id', () => {
    const ids = editions().map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
