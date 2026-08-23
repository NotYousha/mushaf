import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { THEMES } from '../src/ui/theming'

// Read from disk rather than importing: vitest stubs CSS imports, and `?raw`
// comes back empty, which would have made every check here silently vacuous.
const css = readFileSync('src/ui/themes.css', 'utf8')
const base = readFileSync('src/ui/theme.css', 'utf8')

/**
 * A malformed colour in a theme fails silently: the browser drops the
 * declaration, the token keeps whatever the previous theme set, and the only
 * symptom is one wrong colour on one theme that nobody happens to be looking
 * at. Contrast is checked here too, at the floor each token is actually held
 * to — 4.5:1 for body text, 3:1 for the large numeral and the play glyph.
 */

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const DECL = /--([a-z0-9-]+)\s*:\s*([^;]+);/g

function declarations(block: string) {
  const out: Record<string, string> = {}
  for (const m of block.matchAll(DECL)) out[m[1]] = m[2].trim()
  return out
}

function blocks() {
  const found: { selector: string; decls: Record<string, string> }[] = []
  const re = /(\[data-theme=[^{]+)\{([^}]*)\}/g
  for (const m of css.matchAll(re)) {
    found.push({ selector: m[1].trim(), decls: declarations(m[2]) })
  }
  return found
}

const defaults = declarations(base.slice(base.indexOf(':root {'), base.indexOf('* {')))

const rgb = (v: string) => {
  let h = v.slice(1)
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

const luminance = (c: number[]) => {
  const [r, g, b] = c.map((v) => {
    const x = v / 255
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const PAIRS: [string, string[], number][] = [
  ['ink', ['card', 'card-2', 'bg', 'page'], 4.5],
  ['ink-strong', ['card', 'card-2', 'bg'], 4.5],
  ['muted', ['card', 'card-2'], 4.5],
  ['ink-soft', ['card'], 4.5],
  ['accent-deep', ['card'], 4.5],
  ['accent', ['card'], 3],
  ['tile-active-ink', ['tile-active-a', 'tile-active-b'], 3],
  ['on-accent', ['accent'], 4.5],
  ['on-play', ['play-a', 'play-b'], 3],
]

describe('themes', () => {
  it('defines a block for every theme the picker offers', () => {
    const selectors = blocks().map((b) => b.selector)
    for (const theme of THEMES) {
      // Mushaf is the default palette and lives in theme.css, so it only
      // needs a dark block; the rest need both.
      const wanted = theme.id === 'mushaf' ? ["[data-mode='dark']"] : ['', "[data-mode='dark']"]
      for (const suffix of wanted) {
        expect(
          selectors.some((s) => s.includes(`'${theme.id}'`) && s.includes(suffix)),
          `${theme.id} ${suffix || 'light'}`,
        ).toBe(true)
      }
    }
  })

  it('gives every colour a value the browser can parse', () => {
    const bad: string[] = []
    for (const { selector, decls } of blocks()) {
      for (const [name, value] of Object.entries(decls)) {
        if (value.startsWith('#') && !HEX.test(value)) bad.push(`${selector} --${name}: ${value}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('keeps text readable on every theme', () => {
    const failures: string[] = []
    for (const { selector, decls } of blocks()) {
      const palette = { ...defaults, ...decls }
      for (const [fg, grounds, floor] of PAIRS) {
        const f = palette[fg]
        if (!f?.startsWith('#')) continue
        for (const bgName of grounds) {
          const b = palette[bgName]
          if (!b?.startsWith('#')) continue
          const ratio = contrast(rgb(f), rgb(b))
          if (ratio < floor) {
            failures.push(`${selector} --${fg} on --${bgName} ${ratio.toFixed(2)}:1 < ${floor}`)
          }
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('pins a colour scheme so form controls follow the palette', () => {
    for (const { selector, decls } of blocks()) {
      expect(Object.keys(decls).length, selector).toBeGreaterThan(10)
    }
    for (const b of blocks()) {
      const isDark = b.selector.includes("data-mode='dark'")
      const scheme = /color-scheme:\s*(\w+)/.exec(css.slice(css.indexOf(b.selector)))?.[1]
      expect(scheme, b.selector).toBe(isDark ? 'dark' : 'light')
    }
  })
})
