import { describe, it, expect } from 'vitest'
import { searchSurahs, foldArabic, foldLatin, parseReference } from '../src/catalog/search'
import { buildView, surahMeta } from '../src/catalog/load'
import { mosqueReciters } from '../src/catalog/mosques'

const year = mosqueReciters().find((r) => r.id === 'haram-1447')!
const surahs = buildView(year, surahMeta)
const find = (q: string) => searchSurahs(surahs, q).map((s) => s.surah)

/**
 * Every one of these returned nothing before. Surah 1 is written with alef
 * wasla — a different character from the ا anyone types — and the stored
 * transliteration is "Al-Faatiha", so the ordinary spelling missed too.
 */
describe('finding a surah by name', () => {
  it('finds Al-Fatiha, in either script, however it is typed', () => {
    for (const q of ['الفاتحة', 'ٱلفاتحة', 'fatiha', 'Al-Fatiha', 'faatiha', 'FATIHA']) {
      expect(find(q), `"${q}"`).toContain(1)
    }
  })

  it('finds the surahs people actually search for', () => {
    expect(find('baqarah')).toContain(2)
    expect(find('البقرة')).toContain(2)
    expect(find('yasin')).toContain(36)
    expect(find('ikhlas')).toContain(112)
    expect(find('kahf')).toContain(18)
    expect(find('mulk')).toContain(67)
  })

  // Printed in every row in English, and previously not searchable at all.
  it('searches the English meaning', () => {
    expect(find('cow')).toContain(2)
    expect(find('the opening')).toContain(1)
    expect(find('cave')).toContain(18)
  })

  it('finds a surah by number, and treats a short number as a prefix', () => {
    expect(find('18')[0]).toBe(18)
    // Typing 11 on the way to 114 must not empty the list.
    expect(find('11')).toContain(114)
    expect(find('11')[0]).toBe(11)
  })

  // On a year that names its reciters, the name is on screen — so it should
  // be findable.
  it('searches the reciter on a Taraweeh year', () => {
    const baleela = find('baleela')
    expect(baleela.length).toBeGreaterThan(5)
    expect(find('بليلة').length).toBeGreaterThan(5)
  })

  it('returns everything for an empty query, and nothing for nonsense', () => {
    expect(searchSurahs(surahs, '   ')).toHaveLength(114)
    expect(find('zzzzqqq')).toHaveLength(0)
  })
})

describe('folding', () => {
  // The distinctions carry meaning in print and none in a search box.
  it('folds the alef forms together', () => {
    expect(foldArabic('ٱلفاتحة')).toBe(foldArabic('الفاتحة'))
    expect(foldArabic('أحمد')).toBe(foldArabic('احمد'))
  })

  it('strips marks and tatweel', () => {
    expect(foldArabic('ٱلْفَاتِحَةِ')).toBe(foldArabic('الفاتحه'))
  })

  it('collapses doubled vowels and the article', () => {
    expect(foldLatin('Al-Faatiha')).toBe(foldLatin('fatiha'))
    expect(foldLatin('Al-Baqara')).toBe(foldLatin('baqara'))
  })
})

describe('a reference typed into the search box', () => {
  const ref = (q: string) => parseReference(surahs, q)
  it('reads surah:ayah in either digit set and with common separators', () => {
    expect(ref('2:255')).toEqual({ surah: 2, ayah: 255 })
    expect(ref('٢:٢٥٥')).toEqual({ surah: 2, ayah: 255 })
    expect(ref('2.255')).toEqual({ surah: 2, ayah: 255 })
    expect(ref('18 - 10')).toEqual({ surah: 18, ayah: 10 })
  })
  it('reads a surah name followed by an ayah', () => {
    expect(ref('kahf 10')).toEqual({ surah: 18, ayah: 10 })
    expect(ref('Al-Kahf:10')).toEqual({ surah: 18, ayah: 10 })
    expect(ref('الكهف 10')).toEqual({ surah: 18, ayah: 10 })
  })
  it('refuses ayahs that do not exist, and bare numbers', () => {
    expect(ref('1:8')).toBeNull()
    expect(ref('114:7')).toBeNull()
    expect(ref('115:1')).toBeNull()
    expect(ref('2')).toBeNull()
    expect(ref('2 255')).toBeNull()
  })
  it('lists the referenced surah', () => {
    expect(find('2:255')).toEqual([2])
    expect(find('kahf 10')).toEqual([18])
    // A plain number is still a surah search, prefix and all.
    expect(find('11').slice(0, 2)).toEqual([11, 110])
  })
})
