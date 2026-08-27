/**
 * The translations, and the one thing about them that is not a technical
 * decision.
 *
 * Every translation here comes from the Tanzil Project, which offers them for
 * non-commercial use and asks for a link back where more than three are used.
 * Al-Mau'iza is free and NOTICES.md carries the link and the translators'
 * names. Nothing here may be sold with the app without going back to the
 * translators and publishers first.
 *
 * Dr. Mustafa Khattab's *The Clear Quran* is the translation most people ask
 * for and it is not here. Furqaan Institute of Quranic Education holds an
 * exclusive licence to publish and distribute it: quran.com has withdrawn it
 * from their public API, and the Quranic Universal Library carries it as the
 * one resource on the site with no download. Copies of the text are easy to
 * find and none of them is a licence. Talal Itani's translation — confusingly
 * also called *Clear Quran*, but a different work under free terms — is
 * offered instead, and the day Furqaan Institute grants permission the other
 * can be added in one line.
 */
import manifest from '../../data/translations.json'
import type { Lang } from '../i18n'

export type Translation = {
  id: string
  /** The interface language this is the default for. */
  lang: string
  /** Shown in the picker, in its own script. */
  name: string
  translator: string
  source: string
  /**
   * Arabic explained in Arabic rather than rendered into another language.
   *
   * Al-Muyassar is a short tafsir, not a translation, and calling it one in
   * the interface would misdescribe it to the readers most able to tell.
   */
  tafsir: boolean
  default: boolean
  bytes: number
}

export const TRANSLATIONS = manifest as Translation[]

export const translationById = (id: string): Translation | undefined =>
  TRANSLATIONS.find((t) => t.id === id)

/**
 * What to show a reader who has not chosen.
 *
 * Their interface language, if anything is published in it — and English if
 * not, because a translation in a language you do not read is no better than
 * none, while English is the second language of most of the rest of the list.
 */
export const defaultFor = (lang: Lang): string =>
  TRANSLATIONS.find((t) => t.lang === lang && t.default)?.id ??
  TRANSLATIONS.find((t) => t.lang === 'en' && t.default)?.id ??
  TRANSLATIONS[0].id

/** A translation, as `{ "2": ["ayah 1", "ayah 2", …] }`. */
export type TranslationText = Record<string, string[]>

const BASE = import.meta.env?.BASE_URL ?? '/'
const cache = new Map<string, Promise<TranslationText | null>>()

/**
 * Fetched, not bundled.
 *
 * Six translations are five and a half megabytes of JSON. A reader who wants
 * English should not download Urdu, Hindi, French and an Arabic tafsir to get
 * it — so each is a file of its own, requested when it is first opened and
 * kept by the service worker afterwards, which is what makes it work offline
 * without making it a cost at install.
 *
 * A failure resolves to null rather than throwing. The page above shows the
 * Arabic either way; a translation that could not be fetched should quietly
 * be absent, not take the ayah down with it.
 */
export function loadTranslation(id: string): Promise<TranslationText | null> {
  if (!cache.has(id)) {
    cache.set(
      id,
      fetch(`${BASE}trans/${id}.json`)
        .then((r) => (r.ok ? (r.json() as Promise<TranslationText>) : null))
        .catch(() => null),
    )
  }
  return cache.get(id)!
}
