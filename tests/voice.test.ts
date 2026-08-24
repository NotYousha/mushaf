import { describe, it, expect } from 'vitest'
import { voiceLabel, artistFor, artistForEn } from '../src/catalog/voice'
import type { SurahView, Reciter } from '../src/catalog/types'

const view = (over: Partial<SurahView> = {}): SurahView => ({
  surah: 1,
  name: 'ٱلْفَاتِحَةِ',
  nameEn: 'Al-Fatihah',
  translation: 'The Opening',
  ayahs: 7,
  released: true,
  verified: true,
  url: 'https://example.test/1.mp3',
  fallbackUrl: null,
  bytes: 1,
  voice: null,
  voiceEn: null,
  voicePhoto: null,
  voiceId: null,
  ...over,
})

const reciter = (over: Partial<Reciter> = {}): Reciter => ({
  id: 'dosari',
  name: 'ياسر الدوسري',
  nameEn: 'Yasser Al-Dosari',
  fullName: 'أ. د. ياسر بن راشد الدوسري',
  mushaf: 'إنتاج المركز السعودي للتلاوات القرآنية',
  released: 114,
  total: 114,
  surahs: [],
  ...over,
})

describe('voiceLabel', () => {
  // Arabic and Urdu readers are already reading the script the name is in.
  it('gives the Arabic form to the Arabic-script languages', () => {
    const s = view({ voice: 'عبد الرحمن السديس', voiceEn: 'Abdurrahman As-Sudais' })
    expect(voiceLabel(s, 'ar')).toBe('عبد الرحمن السديس')
    expect(voiceLabel(s, 'ur')).toBe('عبد الرحمن السديس')
  })

  it('gives the transliteration to the Latin-script languages', () => {
    const s = view({ voice: 'عبد الرحمن السديس', voiceEn: 'Abdurrahman As-Sudais' })
    expect(voiceLabel(s, 'en')).toBe('Abdurrahman As-Sudais')
    expect(voiceLabel(s, 'fr')).toBe('Abdurrahman As-Sudais')
    expect(voiceLabel(s, 'hi')).toBe('Abdurrahman As-Sudais')
  })

  // One sheikh's mushaf names him above the list. Repeating it on all 114
  // rows says nothing.
  it('is null for a single-voice mushaf', () => {
    expect(voiceLabel(view(), 'en')).toBeNull()
    expect(voiceLabel(view(), 'ar')).toBeNull()
  })

  // Attribution should degrade to the Arabic rather than vanish.
  it('falls back to the Arabic when no transliteration was supplied', () => {
    expect(voiceLabel(view({ voice: 'بندر بليلة' }), 'en')).toBe('بندر بليلة')
  })
})

describe('artistFor', () => {
  // The lock screen and the car. A compilation title there tells the listener
  // nothing about who they are hearing.
  it('names the imam when the surah has one', () => {
    const s = view({ voice: 'بندر بليلة', voiceEn: 'Bandar Baleela' })
    expect(artistFor(s, reciter())).toBe('بندر بليلة')
    expect(artistForEn(s, reciter())).toBe('Bandar Baleela')
  })

  // Proves the existing four entries are untouched.
  it('falls back to the reciter for a single-voice mushaf', () => {
    expect(artistFor(view(), reciter())).toBe('أ. د. ياسر بن راشد الدوسري')
    expect(artistForEn(view(), reciter())).toBe('Yasser Al-Dosari')
  })
})
