import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReciterPanel, searchFaces } from '../src/ui/ReciterPanel'
import type { HomeFace } from '../src/ui/HomePanel'
import { getReciters } from '../src/catalog/load'
import { shortTitle } from '../src/catalog/titles'
import { stringsFor, type Lang } from '../src/i18n'
import { inScript } from '../src/i18n/script'

/**
 * The roster exactly as App builds it: one label, in the reader's own script,
 * plus the honorific. That single-script label is the whole difficulty — see
 * the cross-script test below.
 */
const roster = (lang: Lang): HomeFace[] =>
  getReciters()
    .filter((r) => !r.group)
    .map((r) => ({
      id: r.id,
      label: inScript(lang, r.name, r.nameEn),
      title: shortTitle(r.id, lang),
      tag: r.tag ? inScript(lang, r.tag, r.tagEn) : null,
      src: null,
      frame: null,
    }))

const ids = (q: string, lang: Lang = 'en') =>
  searchFaces(roster(lang), q, lang).map((f) => f.id)

describe('finding a reciter by name', () => {
  /**
   * The failure this field exists to avoid. Every stored spelling carries the
   * article — "Yasser Al-Dosari", "Abdurrahman As-Sudais" — so a substring
   * search over the printed name cannot find the surname anybody types.
   */
  it('finds a reciter by his surname, article or no article', () => {
    for (const q of ['dosari', 'Al-Dosari', 'al dosari', 'DOSARI']) {
      expect(ids(q), `"${q}"`).toContain('dosari')
    }
    expect(ids('sudais')).toContain('sudais')
    expect(ids('shuraim')).toContain('shuraim')
    expect(ids('afasy')).toContain('afasy')
  })

  it('finds him in Arabic, however the query is typed', () => {
    // Bare alef for the alef the name is written with, and no marks — which
    // is all a phone keyboard sends.
    expect(ids('الدوسري', 'ar')).toContain('dosari')
    expect(ids('السديس', 'ar')).toContain('sudais')
    expect(ids('بليلة', 'ar')).toContain('baleela')
    expect(ids('بليله', 'ar')).toContain('baleela')
  })

  /**
   * The card in an Arabic interface prints ياسر الدوسري and nothing else, so
   * a Latin query has no printed text to match. The catalogue's other
   * spelling is what saves it — and the same in reverse.
   */
  it('matches across scripts, whichever the interface is in', () => {
    expect(ids('dosari', 'ar')).toContain('dosari')
    expect(ids('muaiqly', 'ur')).toContain('muaiqly')
    expect(ids('الدوسري', 'en')).toContain('dosari')
  })

  // The consonants hold; the vowels are somebody's choice of romanisation.
  it('matches a different romanisation of the same name', () => {
    expect(ids('soudais')).toContain('sudais')
    expect(ids('juhani')).toContain('juhany')
    expect(ids('moaiqly')).toContain('muaiqly')
  })

  it('finds a man by his honorific or his office', () => {
    expect(ids('grand mosque')).toContain('sudais')
    expect(ids('المسجد الحرام', 'ar')).toContain('sudais')
    // The office is published in the reader's language, but the phrase a
    // reader knows the man by may be the English one.
    expect(ids('grand mosque', 'ur')).toContain('sudais')
  })

  /**
   * Two of the sheikhs are on the grid twice, and the tag is the only thing
   * telling the cards apart — so it has to be searchable.
   */
  it('finds the second mushaf of a man who has two, by its tag', () => {
    expect(ids('hafs')).toContain('juhany-hafs')
    expect(ids('حفص', 'ar')).toContain('juhany-hafs')
    // And across scripts, like the name: an Arabic card never prints "Hafs".
    expect(ids('hafs', 'ar')).toContain('juhany-hafs')
    expect(ids('duri', 'ar')).toContain('juhany')
  })

  it('shows everyone for an empty query, and nobody for nonsense', () => {
    const all = roster('en')
    expect(searchFaces(all, '', 'en')).toHaveLength(all.length)
    // Clearing the box has to restore the grid, whitespace included.
    expect(searchFaces(all, '   ', 'en')).toHaveLength(all.length)
    expect(ids('zzzzqqq')).toHaveLength(0)
  })

  // Narrowing, not thrashing: each further letter can only remove faces.
  it('narrows as the query grows', () => {
    const steps = ['s', 'su', 'sud', 'suda', 'sudais'].map((q) => ids(q).length)
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeLessThanOrEqual(steps[i - 1])
    }
    expect(ids('sudais')).toEqual(['sudais'])
  })
})

/** Rendered markup, so an apostrophe arrives escaped — Al-Bu'ayjan. */
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/'/g, '&#x27;')

const noop = () => {}

const render = (lang: Lang) =>
  renderToStaticMarkup(
    createElement(ReciterPanel, {
      t: stringsFor(lang),
      lang,
      faces: roster(lang),
      activeId: 'dosari',
      counts: {},
      places: [],
      onPick: noop,
      onTogglePlace: noop,
    }),
  )

describe('the roster panel', () => {
  /**
   * One search field in the app, not two that look almost alike: the Quran
   * tab's field is `.search` in theme.css and this one is the same class.
   */
  it('draws the same field as the Quran tab, asking for a reciter', () => {
    const html = render('en')
    expect(html).toContain('class="search"')
    expect(html).toContain(`placeholder="${stringsFor('en').searchReciters}"`)
    // Labelled as well as placeheld: a placeholder disappears the moment
    // anything is typed, and the magnifier beside it says nothing out loud.
    expect(html).toContain(`aria-label="${stringsFor('en').searchReciters}"`)
  })

  it('opens on the whole roster, with nothing filtered out', () => {
    const html = render('en')
    for (const f of roster('en')) expect(html).toContain(`>${esc(f.label)}`)
    expect(html).not.toContain(stringsFor('en').noResults)
  })
})
