import type { Lang } from '../i18n'
import { inScript } from '../i18n/script'
import type { Reciter, SurahView } from './types'

/** Who recites this surah, or null when the entry has a single voice. */
export function voiceLabel(s: SurahView, lang: Lang): string | null {
  if (!s.voice) return null
  return inScript(lang, s.voice, s.voiceEn)
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
