import type { Lang } from '../i18n'
import { inScript } from '../i18n/script'

/**
 * The mushaf editions the first-run flow can offer.
 *
 * A seam, not a registry. The real one is being written in
 * `src/mushaf/editions.ts` by the work that adds the other scripts — Uthmani,
 * Tajweed and IndoPak, some as live text and some as page images — and it
 * exports `EDITIONS`, `DEFAULT_EDITION` and `editionById` against the shape
 * mirrored below.
 *
 * This exists so the onboarding step can be built, tested and shipped before
 * that lands, and so switching to it is one import rather than a rewrite: when
 * `src/mushaf/editions.ts` exists, re-export from it here and delete the
 * fallback. Everything downstream reads `editions()` and does not care.
 *
 * The list is never empty — the mushaf the app already bundles is always in it
 * — so the step never needs a feature check and degrades to a single choice.
 */
export type EditionKind = 'text' | 'images'

export type EditionChoice = {
  id: string
  name: string
  nameAr: string
  description: string
  /**
   * 'text' means live Unicode, so word highlighting, search and a screen
   * reader all work on it. 'images' means page pictures, so none of them do —
   * which is worth telling somebody before they choose it.
   */
  kind: EditionKind
}

/**
 * The mushaf as it ships today: the fifteen-line Madani layout the app draws
 * from `data/mushaf-layout.json`, as live text.
 */
const BUNDLED: EditionChoice = {
  id: 'madani-15',
  name: 'Madani, 15 lines',
  nameAr: 'المصحف المدني، ١٥ سطرًا',
  description: 'Hafs from Asim, as the app has always drawn it.',
  kind: 'text',
}

export function editions(): EditionChoice[] {
  return [BUNDLED]
}

export const defaultEdition = (): string => BUNDLED.id

/** The reader's own script for the name, falling back to the Latin one. */
export const editionName = (e: EditionChoice, lang: Lang): string =>
  inScript(lang, e.nameAr, e.name)
