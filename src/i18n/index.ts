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
export const DEFAULT_LANG: Lang = 'ar'

/**
 * Mirrored into localStorage so the boot script can read it before the page
 * paints. IndexedDB is the source of truth; this is only a copy.
 */
export const LANG_KEY = 'mushaf:lang'

export const LANGS: { code: Lang; label: string; dir: 'rtl' | 'ltr' }[] = [
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ur', label: 'اردو', dir: 'rtl' },
  { code: 'hi', label: 'हिन्दी', dir: 'ltr' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
]

const STRINGS: Record<Lang, Strings> = { ar, en, ur, hi, fr }

export const stringsFor = (lang: Lang): Strings => STRINGS[lang] ?? en

export const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.code === v)

/** Which way a language is written. */
export const dirOf = (lang: Lang): 'ltr' | 'rtl' =>
  LANGS.find((l) => l.code === lang)?.dir ?? 'ltr'

/**
 * The language the boot script acted on, so React's first render agrees with
 * what is already stamped on <html>.
 *
 * The preference lives in IndexedDB with every other setting, and that cannot
 * be read without awaiting — so the app used to mount holding a hardcoded
 * 'ar', stamp the whole interface right-to-left, and only put the reader's own
 * language back a moment later when IndexedDB answered. An English reader saw
 * the Arabic interface on every single launch, and the headings changed face as
 * it resolved, because --font-name is the serif in RTL and the sans in LTR.
 *
 * The same trick theme and mode have had all along; lang was simply never
 * given it.
 */
export function bootLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY)
    return isLang(v) ? v : DEFAULT_LANG
  } catch {
    // Site data blocked. The boot script fell back to the same default, so the
    // two still agree and nothing moves after mount.
    return DEFAULT_LANG
  }
}
