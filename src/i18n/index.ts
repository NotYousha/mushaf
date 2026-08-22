import { en, type Strings } from './en'
import { ar } from './ar'
import { ur } from './ur'
import { hi } from './hi'
import { fr } from './fr'

export type { Strings }

export type Lang = 'ar' | 'en' | 'ur' | 'hi' | 'fr'

/**
 * The interface languages, in the order the picker shows them.
 *
 * Each is labelled in its own script rather than in English: someone looking
 * for Urdu is looking for اردو, and a list of English names is no use to the
 * person who most needs the picker.
 *
 * Surah names stay Arabic in every language — the name of a surah is Arabic,
 * and transliterating it serves nobody. What changes is the supporting line
 * beneath, which Arabic alone does without, because a reader of Arabic does
 * not need Al-Kahf glossed as "The Cave".
 */
export const LANGS: { code: Lang; label: string; dir: 'rtl' | 'ltr' }[] = [
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ur', label: 'اردو', dir: 'rtl' },
  { code: 'hi', label: 'हिन्दी', dir: 'ltr' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
]

const STRINGS: Record<Lang, Strings> = { ar, en, ur, hi, fr }

export const stringsFor = (lang: Lang): Strings => STRINGS[lang] ?? en
