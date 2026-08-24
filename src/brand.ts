import type { Lang } from './i18n'
import { isArabicScript } from './i18n/script'

/**
 * The app's name.
 *
 * A proper noun, so it is not translated — it is only written in whichever
 * script the reader is already reading. Both forms are shown together in the
 * header, because the name is new and each half teaches the other.
 */
export const BRAND = {
  ar: 'الموعظة',
  latin: "Al-Mau'iza",
  /** What the app is, which does get said in the reader's language. */
  quranAr: 'القرآن',
  quranLatin: 'Al Quran',
}

export const brandName = (lang: Lang) => (isArabicScript(lang) ? BRAND.ar : BRAND.latin)

export const brandSecondary = (lang: Lang) =>
  isArabicScript(lang) ? BRAND.latin : BRAND.ar
