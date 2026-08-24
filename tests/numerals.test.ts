import { describe, it, expect } from 'vitest'
import { digits, toArabicDigits } from '../src/i18n/script'
import { formatBytes, formatTime } from '../src/ui/format'
import { mosqueReciters } from '../src/catalog/mosques'
import { LANGS } from '../src/i18n'

const ARABIC_INDIC = /[٠-٩]/
const WESTERN = /[0-9]/

describe('digits', () => {
  it('writes Arabic-Indic for the Arabic-script languages', () => {
    expect(digits('ar', 114)).toBe('١١٤')
    expect(digits('ur', 10)).toBe('١٠')
  })

  it('leaves the Latin-script languages Western', () => {
    for (const l of ['en', 'fr', 'hi'] as const) expect(digits(l, 114), l).toBe('114')
  })

  it('converts only digits, leaving punctuation alone', () => {
    expect(toArabicDigits('1:05')).toBe('١:٠٥')
    expect(toArabicDigits('83/114')).toBe('٨٣/١١٤')
  })

  it('returns something non-empty for every language', () => {
    for (const l of LANGS) expect(digits(l.code, 7).length, l.code).toBeGreaterThan(0)
  })
})

describe('formatTime', () => {
  it('is Western without a language, for anything not on screen', () => {
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(3725)).toBe('1:02:05')
  })

  it('writes the reader.s digits when given a language', () => {
    expect(formatTime(65, 'ar')).toContain('١:٠٥')
    expect(formatTime(65, 'en')).toContain('1:05')
  })

  /**
   * A clock reads left to right in every language — 1:05 is one minute five,
   * never five past one — so it is wrapped in an LTR isolate. Without it the
   * bidi algorithm reorders the run around the colon in an RTL paragraph.
   */
  it('isolates the clock so RTL cannot reorder it', () => {
    expect(formatTime(65, 'ar')).toMatch(/^⁦.*⁩$/)
  })

  it('still guards nonsense input', () => {
    expect(formatTime(Number.NaN, 'en')).toBe('0:00')
    expect(formatTime(-5, 'ar')).toContain('٠:٠٠')
  })
})

describe('formatBytes', () => {
  it('is Western without a language', () => {
    expect(formatBytes(5 * 1_048_576)).toBe('5 MB')
    expect(formatBytes(0)).toBe('—')
  })

  it('writes the reader.s digits when given a language', () => {
    expect(formatBytes(5 * 1_048_576, 'ar')).toContain('٥')
    expect(formatBytes(5 * 1_048_576, 'en')).toContain('5')
  })

  // MB and GB are read as-is on an Arabic phone, but a Latin unit beside
  // Arabic-Indic digits is exactly the pair the bidi algorithm reorders, so
  // the two are isolated together.
  it('keeps the unit with its number', () => {
    const out = formatBytes(2048 * 1_048_576, 'ar')
    expect(out).toContain('GB')
    expect(out).toMatch(/^⁨.*⁩$/)
  })
})

/**
 * Numbers that something else has to parse must stay Western, whatever the
 * interface language. A localized URL 404s and a localized key misses.
 */
describe('machine-read numbers stay Western', () => {
  it('keeps every audio URL in Western digits', () => {
    for (const r of mosqueReciters().slice(0, 6)) {
      for (const s of r.surahs.slice(0, 4)) {
        expect(s.url).toMatch(WESTERN)
        expect(s.url).not.toMatch(ARABIC_INDIC)
      }
    }
  })

  it('keeps reciter ids in Western digits', () => {
    for (const r of mosqueReciters()) {
      expect(r.id, r.id).not.toMatch(ARABIC_INDIC)
    }
  })
})
