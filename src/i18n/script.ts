import type { Lang } from './index'

/**
 * Which script the reader is already reading.
 *
 * Arabic and Urdu are written in the Arabic script, so a name written in it
 * needs no help. The other three read Latin, and a name they cannot decode is
 * not a name to them — it is a shape.
 */
export const isArabicScript = (lang: Lang) => lang === 'ar' || lang === 'ur'

/**
 * A proper noun in whichever script the reader is already reading.
 *
 * Names are never translated — Yasser Al-Dosari is not the English for ياسر
 * الدوسري, it is the same name written so a Latin reader can say it. This is
 * the one decision behind the reciter strip, the brand, the riwayah and the
 * per-surah imam, which is why it lives in one place: the strip used to mix
 * Arabic reciter names with an English section label in the same row, which
 * happens the moment two of them answer this question differently.
 *
 * Falls back to the Arabic when no transliteration exists, because a name in
 * the wrong script still beats a blank.
 */
export const inScript = (lang: Lang, arabic: string, latin?: string | null): string =>
  isArabicScript(lang) ? arabic : (latin ?? arabic)

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩'

/** ١٢٣ from 123. Digits only — anything else in the string is left alone. */
export const toArabicDigits = (n: number | string) =>
  String(n).replace(/\d/g, (d) => ARABIC_INDIC[Number(d)])

/**
 * A number written the way the reader writes numbers.
 *
 * Arabic and Urdu get Arabic-Indic digits; the Latin-script languages keep
 * Western ones. Use this for anything a person reads. Do NOT use it for a
 * value something else has to parse — a URL, a key, an aria-valuenow, a CSS
 * length, a filename — those must stay Western or they stop working.
 */
export const digits = (lang: Lang, n: number | string): string =>
  isArabicScript(lang) ? toArabicDigits(n) : String(n)
