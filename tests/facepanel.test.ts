import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FacePanel, type FaceSubject } from '../src/ui/FacePanel'
import { stringsFor } from '../src/i18n'
import { DEFAULT_FRAMINGS, type Face } from '../src/db/faces'
import { getReciters } from '../src/catalog/load'

const noop = async () => {}

function render(reciters: FaceSubject[], faces: Map<string, Face> = new Map()) {
  return renderToStaticMarkup(
    createElement(FacePanel, {
      t: stringsFor('en'),
      lang: 'en',
      base: '/',
      faces,
      reciters,
      onPick: noop,
      onFrame: noop,
      onRemove: noop,
      onExport: noop,
      onImport: async () => 0,
      onClearAll: async () => 0,
    }),
  )
}

/**
 * The photo settings used to list only the imams of the Taraweeh years, which
 * left the reciters of the individual mushafs with a portrait nobody could
 * move. These assert the two things that were actually broken: that they are
 * listed at all, and that a portrait the app ships can be framed rather than
 * only replaced.
 */
describe('the photo settings', () => {
  const withPhoto: FaceSubject = {
    id: 'afasy',
    name: 'مشاري راشد العفاسي',
    nameEn: 'Mishary Rashid Al-Afasy',
    photo: 'afasy.webp',
  }
  const withoutPhoto: FaceSubject = {
    id: 'nobody',
    name: 'لا صورة',
    nameEn: 'No Portrait',
    photo: null,
  }

  it('lists the mushaf reciters under their own heading', () => {
    const html = render([withPhoto])
    expect(html).toContain(stringsFor('en').facesMushafs)
    expect(html).toContain('Mishary Rashid Al-Afasy')
  })

  it('offers to frame a portrait that ships with the app', () => {
    const html = render([withPhoto])
    // The button that opens the drag-and-zoom editor. Before this it appeared
    // only once the listener had supplied a picture of their own.
    expect(html).toContain('face-frame-btn')
    expect(html).toContain(stringsFor('en').faceAdjust)
    // And says whose picture it is, so a wrong face is traceable.
    expect(html).toContain(stringsFor('en').faceSourceApp)
  })

  it('offers nothing to frame where there is no picture at all', () => {
    // Counted rather than searched for: the imam rosters are always rendered
    // above, and plenty of them are framable, so the string is present either
    // way. What matters is whether this row added one.
    const count = (html: string) => html.split('face-frame-btn').length - 1
    const blank = render([withoutPhoto])
    expect(blank).toContain('No Portrait')
    expect(count(blank)).toBe(count(render([])))
    expect(count(render([withPhoto]))).toBe(count(render([])) + 1)
    // Still offers to add one.
    expect(blank).toContain(stringsFor('en').faceAdd)
    expect(blank).toContain('face-thumb is-empty')
  })

  it('resolves a bundled portrait against the deployment base', () => {
    const html = render([withPhoto])
    expect(html).toContain('/afasy.webp')
  })

  it("prefers the listener's own picture, and says so", () => {
    const faces = new Map<string, Face>([
      ['afasy', { url: 'blob:mine', ...DEFAULT_FRAMINGS }],
    ])
    const html = render([withPhoto], faces)
    expect(html).toContain('blob:mine')
    expect(html).toContain(stringsFor('en').faceSourceYours)
  })

  /**
   * The panel is fed from the catalog, so every mushaf in it should be
   * reachable here. Asserted against the real catalog rather than a fixture:
   * a reciter added without a portrait is exactly the case that used to go
   * unnoticed.
   */
  it('can list every individual mushaf in the catalog', () => {
    const individual = getReciters()
      .filter((r) => !r.group)
      .map((r) => ({
        id: r.id,
        name: r.name,
        nameEn: r.nameEn,
        photo: r.photo ?? null,
      }))
    expect(individual.length).toBeGreaterThanOrEqual(8)
    const html = render(individual)
    // Rendered markup, so an apostrophe arrives escaped — Al-Bu'ayjan.
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;')
    for (const r of individual) {
      expect(html, r.id).toContain(esc(r.nameEn))
    }
    /**
     * Almost every one ships a portrait, and the ones that do not are named.
     *
     * A bundled portrait is a claim about who a man is, so a reciter added
     * without one keeps a blank ring rather than borrowing a face that might
     * be somebody else's — the failure this file was written against is a
     * reciter appearing under the wrong portrait, not under none. Listing him
     * here is the point: this panel is where a face gets supplied, so a
     * faceless entry has to reach it to stop being faceless.
     *
     * Drop public/<id>.webp in and set `photo` in the source entry to close
     * one of these out.
     */
    const FACELESS = new Set(['luhaidan'])
    for (const r of individual) {
      expect(Boolean(r.photo), `${r.id} has no portrait and is not listed as faceless`)
        .toBe(!FACELESS.has(r.id))
    }
  })
})
