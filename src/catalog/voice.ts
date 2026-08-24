import type { Lang } from '../i18n'
import type { Reciter, SurahView } from './types'

/**
 * An imam's name is a proper noun, so it is not translated — only written in
 * whichever script the reader is already reading. Same reasoning as BRAND
 * in src/brand.ts and riwayahLabel in ./riwayah.ts.
 */
const ARABIC_SCRIPT: Lang[] = ['ar', 'ur']

/** Who recites this surah, or null when the entry has a single voice. */
export function voiceLabel(s: SurahView, lang: Lang): string | null {
  if (!s.voice) return null
  if (ARABIC_SCRIPT.includes(lang)) return s.voice
  return s.voiceEn ?? s.voice
}

/**
 * The artist for the lock screen, the car and the native shell.
 *
 * For a compilation this must be the imam, not the collection: "Taraweeh
 * 1447" on a lock screen says nothing about the voice coming out of the
 * speaker. Absent a voice it falls back to the reciter, which is what the
 * four single-voice mushafs have always shown.
 */
export const artistFor = (s: SurahView, r: Reciter): string => s.voice ?? r.fullName
export const artistForEn = (s: SurahView, r: Reciter): string => s.voiceEn ?? r.nameEn
