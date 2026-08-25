import type { SurahView } from './types'

/**
 * Finding a surah by name, in either script, however it is spelled.
 *
 * The old predicate matched raw substrings, so it could not find Al-Fatiha in
 * either language. In Arabic because surah 1 is written with alef wasla — ٱ,
 * U+0671 — which is a different character from the ا anyone types. In English
 * because the stored spelling is "Al-Faatiha", so `fatiha` missed, as did
 * `baqarah`, `yasin` and `ikhlas`. And "The Cow" is printed in every row while
 * not being searchable at all.
 */

/** Marks, and the tatweel used to stretch a join. Never sit in a query. */
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g

/**
 * Fold the letters that are the same letter.
 *
 * Every alef to bare alef, both hehs to heh, the two yehs to yeh — the
 * distinctions carry meaning in print and none in a search box, and a reader
 * typing on a phone keyboard cannot be expected to reproduce them.
 *
 * Deliberately not `String.normalize()`: NFC reorders a shadda against a
 * damma, and the default rendering rule then stacks them the wrong way round.
 * Correct canonically, wrong on the page. Fold a copy for searching; never
 * touch the text that is displayed.
 */
export function foldArabic(s: string): string {
  return s
    .replace(MARKS, '')
    .replace(/[آأإٱٲٳٵ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, '')
}

/**
 * Fold a transliteration to its bones.
 *
 * Doubled vowels collapse — "Al-Faatiha" and "fatiha" are the same word twice.
 * The leading article goes, so "baqara" finds "Al-Baqara". Punctuation and
 * spacing go, because nobody types an apostrophe into a search box.
 */
export function foldLatin(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’`\-_.]/g, '')
    .replace(/\s+/g, '')
    .replace(/^al/, '')
    .replace(/([aeiou])\1+/g, '$1')
    // A closing taa marbuta is written both ways — Al-Baqara and Baqarah are
    // the same word, and a reader types whichever spelling they learned.
    .replace(/h$/, '')
}

/**
 * The consonant skeleton, which is what survives transliteration.
 *
 * Yaseen and Yasin, Faatiha and Fatiha, Ikhlaas and Ikhlas — the consonants
 * hold and the vowels are somebody's choice of romanisation. Comparing
 * skeletons matches whichever spelling a reader learned, which a substring
 * search over one fixed spelling never will.
 *
 * Only used when the query is long enough for a skeleton to mean something;
 * two consonants match half the Quran.
 */
export const skeleton = (s: string) => foldLatin(s).replace(/[aeiou]/g, '')

/**
 * Every surah whose name, translation or number answers the query.
 *
 * An empty query returns everything rather than nothing, so clearing the box
 * restores the list.
 */
/**
 * Arabic-Indic and Extended Arabic-Indic digits, as ASCII.
 *
 * The list writes its numbers with `digits(lang, n)`, so in Arabic and Urdu it
 * shows ٠-٩ — and an Arabic keyboard sends those back. `\d` is ASCII-only, so
 * the numeric branch was skipped, the name fold matched nothing, and the Latin
 * fold reduced the query to empty and short-circuited every remaining test.
 * Typing the number written on the row emptied the list.
 */
const asciiDigits = (s: string) =>
  s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(
    /[\u06f0-\u06f9]/g,
    (d) => String(d.charCodeAt(0) - 0x06f0),
  )

export function searchSurahs(surahs: SurahView[], query: string): SurahView[] {
  const q = asciiDigits(query.trim())
  if (!q) return surahs

  if (/^\d+$/.test(q)) {
    const n = Number(q)
    const exact = surahs.filter((s) => s.surah === n)
    // A number is nearly always a surah number, but 1-114 also reads as a
    // prefix: typing 11 while meaning 114 should not empty the list.
    const prefixed = surahs.filter((s) => String(s.surah).startsWith(q))
    return exact.length ? [...exact, ...prefixed.filter((s) => s.surah !== n)] : prefixed
  }

  const ar = foldArabic(q)
  const la = foldLatin(q)

  return surahs.filter((s) => {
    if (ar && foldArabic(s.name).includes(ar)) return true
    if (!la) return false
    const sk = skeleton(query)
    if (sk.length >= 3 && skeleton(s.nameEn).includes(sk)) return true
    return (
      foldLatin(s.nameEn).includes(la) ||
      // The English meaning is printed in every row; it should be findable.
      foldLatin(s.translation).includes(la) ||
      // And so should whoever is reciting, on a year that names them.
      (!!s.voiceEn && foldLatin(s.voiceEn).includes(la)) ||
      (!!s.voice && !!ar && foldArabic(s.voice).includes(ar))
    )
  })
}
