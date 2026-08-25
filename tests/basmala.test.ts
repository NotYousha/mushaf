import { describe, it, expect } from 'vitest'
import layoutData from '../data/mushaf-layout.json'
import { showsBasmala } from '../src/ui/MushafView'

type Line = { n: number; w: ([string] | [string, string])[] }
const layout = layoutData as unknown as { pages: Line[][] }

/**
 * The basmala above a surah.
 *
 * The mushaf layout carries only words that belong to a numbered ayah, and
 * above every surah except Al-Fatiha the basmala belongs to none — it is
 * printed and recited and not counted. So it is missing from the data, and
 * the app has to put it back: page 2 of this layout begins at line 3 for
 * exactly that reason, with the heading and the basmala both absent.
 */

describe('the basmala', () => {
  it('is printed above every surah but two', () => {
    const shown = []
    for (let s = 1; s <= 114; s++) if (showsBasmala(s)) shown.push(s)
    expect(shown).toHaveLength(112)
    // At-Tawbah opens without it.
    expect(showsBasmala(9)).toBe(false)
    // Al-Fatiha opens with it as ayah 1, already in the text below.
    expect(showsBasmala(1)).toBe(false)
  })

  it('is missing from the layout, which is why it has to be drawn', () => {
    // If the source data ever starts carrying it, this test fails and the
    // app must stop adding a second one.
    const opensBaqarah = layout.pages
      .flat()
      .find((l) => l.w.some((w) => w[1] === '2:1:1'))
    expect(opensBaqarah).toBeDefined()
    const words = opensBaqarah!.w.map((w) => w[0]).join(' ')
    expect(words).not.toContain('بِسْمِ')
  })

  it('can be read out of Al-Fatiha, where the same words are ayah 1', () => {
    const words = layout.pages
      .flat()
      .flatMap((l) => l.w)
      .filter((w) => w[1]?.startsWith('1:1:'))
    // Four words, so what gets drawn is the whole line and not a fragment.
    expect(words).toHaveLength(4)

    /*
     * Asserted by codepoint, not by comparing against a string typed here.
     *
     * The first attempt at this test failed on toContain() against a hand-
     * typed word, because a retyped Arabic string carries a different
     * composition of the same marks. That is the whole reason the app reads
     * the basmala off the page instead of holding a copy — and a test that
     * holds a copy has the identical bug.
     */
    const text = words.map((w) => w[0]).join(' ')
    // Alef wasla, which a keyboard does not produce and a plain alef is not.
    expect(text).toContain('ٱ')
    // The superscript alef of ar-Rahman, which is what marks this as Uthmani
    // orthography rather than an imlaa'i transcription.
    expect(text).toContain('ٰ')
  })

  it('leaves At-Tawbah alone in the data as well as on the screen', () => {
    const opens = layout.pages.flat().find((l) => l.w.some((w) => w[1] === '9:1:1'))
    expect(opens).toBeDefined()
    // Every word on the line that opens At-Tawbah belongs to At-Tawbah: there
    // is no unkeyed basmala sitting in front of it that a second one would
    // duplicate.
    for (const w of opens!.w) {
      if (w[1]) expect(w[1].startsWith('9:')).toBe(true)
    }
  })
})
