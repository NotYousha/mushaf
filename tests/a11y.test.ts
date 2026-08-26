import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * The parts of accessibility that can be checked without a screen reader.
 *
 * No mainstream Quran app claims VoiceOver or TalkBack support, and the
 * substrate for it is already here: the text is Unicode rather than a glyph
 * font, and a glyph font cannot be read aloud at all. What was missing is
 * smaller and stranger — Arabic scripture sitting inside a document whose
 * language is the reader's, which makes a screen reader pronounce the Quran
 * with an English voice.
 */

const read = (p: string) => readFileSync(p, 'utf8')

describe('screen readers', () => {
  it('marks Arabic as Arabic wherever it sits in a translated interface', () => {
    // Each of these renders Arabic regardless of the interface language.
    const places: [string, string][] = [
      ['src/ui/SurahList.tsx', 'name-ar'],
      ['src/ui/MushafView.tsx', 'surah-band-name'],
      ['src/ui/FavouritesPanel.tsx', 'fav-ar'],
      ['src/ui/ImamPanel.tsx', 'imam-r-ar'],
      ['src/App.tsx', 'surah-name'],
    ]
    for (const [file, cls] of places) {
      const src = read(file)
      const at = src.indexOf(cls)
      expect(at, `${cls} not found in ${file}`).toBeGreaterThan(-1)
      // The lang attribute has to be on the same element, so look in the
      // small window around the class name rather than the whole file.
      expect(src.slice(at, at + 90), `${cls} in ${file}`).toContain('lang="ar"')
    }
  })

  it('offers the mushaf page as whole ayahs and hides the word grid', () => {
    const src = read('src/ui/MushafView.tsx')
    // The visual page is words in lines, which read aloud breaks most ayahs
    // in half; the grouped copy is what a screen reader gets instead.
    expect(src).toContain('aria-hidden="true"')
    expect(src).toContain('className="sr-only"')
    expect(src).toMatch(/spoken\.map/)
  })

  it('withholds the spoken copy while the Veil is on', () => {
    // The Veil exists so a hafiz cannot see the words they are recalling. A
    // copy underneath that reads them out defeats it exactly.
    const src = read('src/ui/MushafView.tsx')
    expect(src).toMatch(/veil === 'off' && \(\s*<div className="sr-only"/)
  })

  it('hides the sr-only text without removing it from the a11y tree', () => {
    const css = read('src/ui/theme.css')
    const block = /\.sr-only\s*\{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(block).toContain('clip-path')
    // Either of these would take it out of the accessibility tree too, which
    // is the opposite of what it is for.
    expect(block).not.toMatch(/display:\s*none/)
    expect(block).not.toMatch(/visibility:\s*hidden/)
  })
})

/*
 * On a phone the focus ring is a courtesy. On a television it is the only
 * thing telling anyone which of forty tiles the remote will act on, and a 2px
 * outline is invisible from a sofa. So the television's ring is asserted
 * rather than trusted to survive a later tidy-up of the stylesheet.
 */
describe('the television focus ring', () => {
  const tv = read('src/ui/tv.css')

  it('is thick enough to see from across a room', () => {
    const rule = /\[data-surface='tv'\] :focus-visible \{([^}]*)\}/.exec(tv)?.[1] ?? ''
    const width = Number(/outline:\s*(\d+)px/.exec(rule)?.[1] ?? 0)
    expect(width).toBeGreaterThanOrEqual(4)
  })

  it('does not rely on transform alone, which reduced motion removes', () => {
    // The scale is switched off under prefers-reduced-motion, so if the ring
    // were only a transform, that setting would leave focus invisible.
    expect(tv).toMatch(/\[data-surface='tv'\] :focus-visible \{[^}]*outline:/)
  })

  it('switches hover off rather than merely restyling it', () => {
    // A television browser reports the last touched element as hovered
    // indefinitely, so two things look focused and neither is the live one.
    expect(tv).toMatch(/\[data-surface='tv'\][^{]*:hover/)
  })
})
