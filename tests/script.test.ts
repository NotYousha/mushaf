import { describe, it, expect } from 'vitest'
import { inScript, isArabicScript } from '../src/i18n/script'
import { LANGS, type Lang } from '../src/i18n'
import { brandName, brandSecondary } from '../src/brand'

const ALL = LANGS.map((l) => l.code)

describe('isArabicScript', () => {
  it('is true for exactly the languages written in Arabic script', () => {
    expect(ALL.filter(isArabicScript).sort()).toEqual(['ar', 'ur'])
  })
})

describe('inScript', () => {
  const ar = 'ياسر الدوسري'
  const latin = 'Yasser Al-Dosari'

  it('gives an Arabic-script reader the Arabic', () => {
    expect(inScript('ar', ar, latin)).toBe(ar)
    expect(inScript('ur', ar, latin)).toBe(ar)
  })

  it('gives a Latin-script reader the transliteration', () => {
    expect(inScript('en', ar, latin)).toBe(latin)
    expect(inScript('fr', ar, latin)).toBe(latin)
    expect(inScript('hi', ar, latin)).toBe(latin)
  })

  // A name in the wrong script still beats a blank, so every language gets
  // the Arabic when no transliteration exists — including the Latin ones.
  it('falls back to the Arabic when there is no transliteration', () => {
    for (const lang of ALL) {
      expect(inScript(lang, ar), lang).toBe(ar)
      expect(inScript(lang, ar, null), lang).toBe(ar)
      expect(inScript(lang, ar, undefined), lang).toBe(ar)
    }
  })

  it('never returns empty for any language', () => {
    for (const lang of ALL) expect(inScript(lang, ar, latin).length).toBeGreaterThan(0)
  })
})

/**
 * The reciter strip used to hardcode the Arabic name while the section label
 * beside it was translated, so an English reader saw an English heading next
 * to ياسر الدوسري in the same row. Everything that writes a proper noun now
 * answers the script question the same way, and this pins that agreement.
 */
describe('one script per language, everywhere', () => {
  it('agrees with the brand, which has always done this', () => {
    for (const lang of ALL as Lang[]) {
      const viaBrand = brandName(lang)
      const viaHelper = inScript(lang, 'الموعظة', "Al-Mau'iza")
      expect(viaBrand, lang).toBe(viaHelper)
      // The header shows both, so the other half must be the other script.
      expect(brandSecondary(lang)).not.toBe(viaBrand)
    }
  })
})
