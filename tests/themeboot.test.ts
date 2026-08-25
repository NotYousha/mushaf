import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { DEFAULT_LANG, LANGS } from '../src/i18n'
import {
  THEMES,
  DEFAULT_THEME,
  THEME_KEY,
  MODE_KEY,
  bootPreference,
  resolveMode,
  type Mode,
} from '../src/ui/theming'

/**
 * The script that stamps the theme before the page paints.
 *
 * It lives inline in index.html, so nothing imports it and nothing type-checks
 * it — a mistake in it is invisible until someone launches the app on a phone
 * and sees a second of cream. It is therefore read off disk here and actually
 * run, against the same stored values the app would have written.
 *
 * Two things are checked that no amount of running it would catch: that the
 * Content-Security-Policy still admits its exact text, since a stale hash means
 * the browser silently refuses to run it at all, and that its list of theme
 * names still matches THEMES, since a theme added to the picker but not to that
 * list boots as cream for everyone who picks it.
 */

const html = readFileSync('index.html', 'utf8')

const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]

const csp = /http-equiv="Content-Security-Policy"\s*\n?\s*content="([^"]*)"/.exec(html)?.[1] ?? ''
const scriptSrc = /script-src([^;]*);/.exec(csp)?.[1] ?? ''

type Stamped = {
  theme: string | null
  mode: string | null
  lang: string | null
  dir: string | null
}

/** Run the real script text with whatever globals the case is about. */
function boot(opts: {
  store?: Record<string, string> | 'throws'
  prefersDark?: boolean | 'throws'
} = {}): Stamped {
  const stamped: Stamped = { theme: null, mode: null, lang: null, dir: null }
  const localStorage = {
    getItem(key: string) {
      if (opts.store === 'throws') throw new DOMException('blocked', 'SecurityError')
      return opts.store?.[key] ?? null
    },
  }
  const win = {
    matchMedia(query: string) {
      if (opts.prefersDark === 'throws') throw new TypeError('no matchMedia')
      return { matches: opts.prefersDark === true && query.includes('dark') }
    },
  }
  const doc = {
    documentElement: {
      setAttribute(name: string, value: string) {
        if (name === 'data-theme') stamped.theme = value
        if (name === 'data-mode') stamped.mode = value
        if (name === 'lang') stamped.lang = value
        if (name === 'dir') stamped.dir = value
      },
    },
  }
  new Function('localStorage', 'window', 'document', inlineScripts[0][1])(localStorage, win, doc)
  return stamped
}

describe('theme boot script', () => {
  it('is the only inline script on the page', () => {
    expect(inlineScripts).toHaveLength(1)
  })

  it('is admitted by the policy under a hash of its exact text', () => {
    const hash = createHash('sha256').update(inlineScripts[0][1], 'utf8').digest('base64')
    expect(scriptSrc).toContain(`'sha256-${hash}'`)
  })

  it('never buys that admission with unsafe-inline', () => {
    // style-src keeps its own unsafe-inline for the styles React writes onto
    // elements; the point here is that script-src was not widened to match.
    expect(scriptSrc).not.toContain('unsafe-inline')
    expect(scriptSrc).not.toContain('unsafe-eval')
    // The bundle is still same-origin and still has to be allowed.
    expect(scriptSrc).toContain("'self'")
  })

  it('no longer points at the file this replaced', () => {
    expect(html).not.toContain('theme-boot.js')
  })

  it('knows every theme the picker offers, and only those', () => {
    const listed = /var THEMES = \[([^\]]*)\]/.exec(inlineScripts[0][1])?.[1] ?? ''
    const names = [...listed.matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(names).toEqual(THEMES.map((t) => t.id))
  })

  /*
   * The flash this script exists to prevent, for language.
   *
   * Before this, `lang` had no synchronous copy: the app mounted holding a
   * hardcoded 'ar', stamped the whole interface right-to-left, and put the
   * reader's own language back only once IndexedDB answered. An English reader
   * saw the Arabic layout on every launch, and the headings changed typeface on
   * the way, because --font-name is the serif under dir=rtl and the sans under
   * dir=ltr. The stamp has to happen here, before the first paint.
   */
  it('stamps a stored language before anything paints', () => {
    expect(boot({ store: { 'mushaf:lang': 'en' } })).toMatchObject({
      lang: 'en',
      dir: 'ltr',
    })
    expect(boot({ store: { 'mushaf:lang': 'ur' } })).toMatchObject({
      lang: 'ur',
      dir: 'rtl',
    })
  })

  it('falls back to the default language, never to nothing', () => {
    for (const store of [undefined, { 'mushaf:lang': 'klingon' }, { 'mushaf:lang': '' }]) {
      const out = boot({ store })
      expect(out.lang, JSON.stringify(store)).toBe(DEFAULT_LANG)
      expect(out.dir, JSON.stringify(store)).toBe('rtl')
    }
    expect(boot({ store: 'throws' })).toMatchObject({ lang: DEFAULT_LANG, dir: 'rtl' })
  })

  /*
   * The same drift check for the direction map.
   *
   * A language in the picker but not in that map boots as Arabic
   * right-to-left for whoever picks it, which is the very flash this script
   * exists to prevent.
   */
  it('knows the direction of every language the picker offers', () => {
    const map = /var DIRS = \{([^}]*)\}/.exec(inlineScripts[0][1])?.[1] ?? ''
    const listed = Object.fromEntries(
      map
        .split(',')
        .map((pair) => pair.split(':').map((x) => x.trim().replace(/['"]/g, '')))
        .filter((kv) => kv.length === 2 && kv[0]),
    )
    expect(Object.keys(listed).sort()).toEqual(LANGS.map((l) => l.code).sort())
    for (const l of LANGS) expect(listed[l.code], l.code).toBe(l.dir)
  })

  it('stamps a saved choice', () => {
    expect(boot({ store: { [THEME_KEY]: 'kiswah', [MODE_KEY]: 'dark' } })).toMatchObject({
      theme: 'kiswah',
      mode: 'dark',
    })
  })

  it('holds an explicit choice against the system', () => {
    expect(boot({ store: { [THEME_KEY]: 'lapis', [MODE_KEY]: 'light' }, prefersDark: true })).toMatchObject(
      { theme: 'lapis', mode: 'light' },
    )
  })

  it('resolves system against prefers-color-scheme', () => {
    const store = { [THEME_KEY]: 'vellum', [MODE_KEY]: 'system' }
    expect(boot({ store, prefersDark: true }).mode).toBe('dark')
    expect(boot({ store, prefersDark: false }).mode).toBe('light')
  })

  it('falls back to the default when nothing has been saved', () => {
    expect(boot()).toMatchObject({ theme: DEFAULT_THEME, mode: 'light' })
  })

  it('falls back when the saved theme no longer exists', () => {
    // What a reader who chose a theme we later retired has in storage.
    expect(boot({ store: { [THEME_KEY]: 'sadaf', [MODE_KEY]: 'dark' } })).toMatchObject({
      theme: DEFAULT_THEME,
      mode: 'dark',
    })
  })

  it('falls back when the saved values are corrupt', () => {
    for (const junk of ['', '{}', 'null', 'undefined', '[object Object]', '__proto__']) {
      expect(boot({ store: { [THEME_KEY]: junk, [MODE_KEY]: junk } })).toMatchObject({
        theme: DEFAULT_THEME,
        mode: 'light',
      })
    }
  })

  it('still stamps a whole palette when site data is blocked', () => {
    // A private window throws on the very first getItem. The point is that both
    // attributes are still set, so no rule is left half-applied.
    expect(boot({ store: 'throws', prefersDark: true })).toMatchObject({
      theme: DEFAULT_THEME,
      mode: 'dark',
    })
  })

  it('still stamps a whole palette when matchMedia is missing', () => {
    expect(boot({ store: { [THEME_KEY]: 'rawdah' }, prefersDark: 'throws' })).toMatchObject({
      theme: 'rawdah',
      mode: 'light',
    })
  })
})

/**
 * The flash was never the boot script getting it wrong; it was React mounting
 * with the default theme and stamping over the boot script's answer before
 * IndexedDB replied. What keeps that from coming back is that the value React
 * starts from and the value stamped in the head are read the same way from the
 * same two keys, so the first effect after mount re-stamps what is already
 * there. This is that agreement, checked for every choice a reader can make.
 */
describe('what React starts from', () => {
  beforeEach(() => localStorage.clear())

  it('agrees with what the head already stamped, for every theme and mode', () => {
    for (const theme of THEMES) {
      for (const mode of ['system', 'light', 'dark'] as Mode[]) {
        localStorage.setItem(THEME_KEY, theme.id)
        localStorage.setItem(MODE_KEY, mode)

        const stamped = boot({ store: { [THEME_KEY]: theme.id, [MODE_KEY]: mode } })
        const seed = bootPreference()

        expect(seed.theme, theme.id).toBe(stamped.theme)
        expect(resolveMode(seed.mode), `${theme.id} ${mode}`).toBe(stamped.mode)
      }
    }
  })

  it('agrees on an empty store, so a first launch does not move either', () => {
    const seed = bootPreference()
    const stamped = boot()
    expect(seed.theme).toBe(stamped.theme)
    expect(resolveMode(seed.mode)).toBe(stamped.mode)
  })

  it('agrees on a retired theme rather than each picking its own', () => {
    localStorage.setItem(THEME_KEY, 'sadaf')
    localStorage.setItem(MODE_KEY, 'light')
    expect(bootPreference()).toMatchObject({ theme: DEFAULT_THEME, mode: 'light' })
  })
})
