import surahs from '../../data/surahs.json'

/** Strip extension, Arabic diacritics, and separator punctuation. */
const strip = (s: string) =>
  s
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[ً-ْٰۖ-ۭ]/g, '')
    .replace(/[ـ_\-()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** Fold Arabic orthographic variants so ألف forms and ة/ه compare equal. */
const normalizeAr = (s: string) =>
  s
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/^سوره\s*/, '')
    .trim()

const flatten = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

/**
 * Map an audio filename to a surah number.
 * Returns null rather than guessing — a wrong match would file the wrong
 * recitation under the wrong name, the worst failure this app can have.
 */
export function matchFilename(filename: string): number | null {
  const base = strip(filename)
  if (!base) return null

  // 1. Leading or standalone number.
  const num = base.match(/^(\d{1,3})(?:\s|$)/)
  if (num) {
    const n = parseInt(num[1], 10)
    if (n >= 1 && n <= 114) return n
    return null
  }

  // 2. Arabic name.
  const ar = normalizeAr(base)
  if (ar) {
    for (const s of surahs) {
      const name = normalizeAr(strip(s.name))
      if (name && (ar === name || ar.includes(name))) return s.surah
    }
  }

  // 3. English name, punctuation-insensitive. Longest name first so
  //    "Al-Nas" cannot shadow a longer name containing it.
  const flat = flatten(base)
  if (flat.length >= 3) {
    const byLength = [...surahs].sort(
      (a, b) => flatten(b.nameEn).length - flatten(a.nameEn).length,
    )
    for (const s of byLength) {
      const en = flatten(s.nameEn)
      if (!en) continue
      if (flat === en || flat.endsWith(en) || flat.startsWith(en)) return s.surah
    }
  }

  return null
}
