import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HomePanel, type HomeFace, type HomeResume } from '../src/ui/HomePanel'
import { stringsFor, type Lang } from '../src/i18n'
import { BRAND } from '../src/brand'

const FACES: HomeFace[] = [
  {
    id: 'dosari',
    label: 'Yasser Al-Dosari',
    src: '/mushaf/sheikh.jpg',
    frame: { zoom: 160, x: 63, y: 13 },
  },
  { id: 'afasy', label: 'Mishary Rashid Al-Afasy', src: '/mushaf/afasy.webp', frame: null },
]

const RESUME: HomeResume = {
  surahName: 'البَقَرَة',
  surahNameEn: 'Al-Baqara',
  verse: 255,
  at: '40:00',
}

const noop = () => {}

/** Rendered markup, so an apostrophe arrives escaped — Al-Mau'iza. */
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/'/g, '&#x27;')

function render(
  opts: { lang?: Lang; resume?: HomeResume | null; faces?: HomeFace[] } = {},
) {
  const lang = opts.lang ?? 'en'
  return renderToStaticMarkup(
    createElement(HomePanel, {
      t: stringsFor(lang),
      lang,
      base: '/mushaf/',
      resume: opts.resume === undefined ? RESUME : opts.resume,
      faces: opts.faces ?? FACES,
      onResume: noop,
      onPickReciter: noop,
      onSeeAll: noop,
      onSearch: noop,
    }),
  )
}

describe('the home screen', () => {
  /**
   * The name is a proper noun in two scripts, and which one is large depends
   * on what the reader is already reading. Both are always present: the name
   * is new, and each half teaches the other.
   */
  it('leads with the name in the reader’s own script, and the other beneath', () => {
    const en = render({ lang: 'en' })
    expect(en).toContain(esc(BRAND.latin))
    expect(en).toContain(BRAND.ar)

    const ar = render({ lang: 'ar' })
    expect(ar).toContain(BRAND.ar)
    expect(ar).toContain(esc(BRAND.latin))
    // The large one swaps; the small one is whichever is left.
    const bigEn = /class="home-brand-main">([^<]+)</.exec(en)![1]
    const bigAr = /class="home-brand-main">([^<]+)</.exec(ar)![1]
    expect(bigEn).toBe(esc(BRAND.latin))
    expect(bigAr).toBe(BRAND.ar)
  })

  it('resolves the logo against the deployment base', () => {
    // A bare "logo.webp" would 404 from a subpath, and an absolute "/logo.webp"
    // would 404 from all of them.
    expect(render()).toContain('src="/mushaf/logo.webp"')
  })

  describe('the continue-reading card', () => {
    it('names the surah, where it stopped, and offers to resume', () => {
      const html = render()
      expect(html).toContain(stringsFor('en').continueReading)
      expect(html).toContain('البَقَرَة')
      expect(html).toContain('Al-Baqara')
      expect(html).toContain('Verse 255')
      expect(html).toContain(stringsFor('en').resumeHere)
    })

    /**
     * Most of the catalogue carries no per-verse timing. Deriving a verse from
     * elapsed seconds would be a confident guess about which ayah someone had
     * reached, so the card says how far in instead.
     */
    it('says how far in when the verse is genuinely unknown', () => {
      const html = render({ resume: { ...RESUME, verse: null } })
      expect(html).toContain('40:00')
      expect(html).not.toContain('Verse')
    })

    it('invites rather than reports when there is nothing to continue', () => {
      const html = render({ resume: null })
      expect(html).toContain(stringsFor('en').homeEmpty)
      // No dead control on a card with nothing to act on.
      expect(html).not.toContain('resume-go')
    })

    it('carries the mushaf photograph, resolved against the base', () => {
      // Rendered markup escapes the quotes inside url('…').
      expect(render()).toContain('/mushaf/quran-page.webp')
      expect(render()).toContain('class="resume-art"')
    })
  })

  describe('the reciters', () => {
    it('lists them with a way through to the rest', () => {
      const html = render()
      expect(html).toContain(stringsFor('en').reciters)
      expect(html).toContain(stringsFor('en').seeAll)
      expect(html).toContain('Yasser Al-Dosari')
      expect(html).toContain('Mishary Rashid Al-Afasy')
    })

    /**
     * A portrait that states no framing inherits the stylesheet's default,
     * which frames one particular uncropped photograph — the mistake that
     * once gave sixteen imams somebody else's face. A stated framing must
     * reach the element, and an unstated one must fall through to the
     * per-reciter rule keyed on data-reciter rather than to nothing.
     */
    it('states a portrait’s framing, or names who it belongs to', () => {
      const html = render()
      expect(html).toContain('background-size:160% auto')
      expect(html).toContain('background-position:63% 13%')
      expect(html).toContain('data-reciter="afasy"')
      // The framed one does not also claim the fallback.
      expect(html).not.toContain('data-reciter="dosari"')
    })

    it('draws an empty ring rather than a broken image', () => {
      const html = render({
        faces: [{ id: 'nobody', label: 'No Portrait', src: null, frame: null }],
      })
      expect(html).toContain('face-round is-empty')
      const cell = /<span class="face-round is-empty"[^>]*>/.exec(html)![0]
      expect(cell).not.toContain('background-image')
      expect(cell).not.toContain('style')
    })
  })

  // Every string on this screen has to exist in every language, or a reader
  // gets a blank where a label should be.
  it.each(['ar', 'en', 'ur', 'hi', 'fr'] as Lang[])(
    'has every label it needs in %s',
    (lang) => {
      const t = stringsFor(lang)
      for (const k of [
        'tabHome',
        'continueReading',
        'resumeHere',
        'seeAll',
        'homeEmpty',
        'homeOpenSearch',
        'reciters',
        'appTitle',
      ] as const) {
        expect(String(t[k]).trim().length, `${lang}.${k}`).toBeGreaterThan(0)
      }
      expect(t.verseAt(7), `${lang}.verseAt`).toContain('7')
      // And it renders without throwing in that language.
      expect(render({ lang }).length).toBeGreaterThan(200)
    },
  )
})
