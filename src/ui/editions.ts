import type { Lang } from '../i18n'
import { inScript } from '../i18n/script'
import { DEFAULT_EDITION, EDITIONS, type Edition } from '../mushaf/editions'

/**
 * The mushaf editions the first-run flow offers.
 *
 * A view onto `src/mushaf/editions.ts`, which is the registry. This file was a
 * standalone stub while the two were being built in parallel; it is now three
 * lines of mapping, and it stays because the onboarding step wants a narrower
 * shape than the reader-facing picker does — a name and a sentence, not a
 * description, a badge, a page count and a tajweed flag.
 *
 * Anything added to `EDITIONS` appears here for free.
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
   *
   * Nothing ships as 'images', and the registry explains why: every edition
   * that would have to be pictures was rejected in favour of one that need
   * not be. The case is kept here because the choice is a real one and the
   * next edition may not have that luxury.
   */
  kind: EditionKind
}

/**
 * The registry's glyph editions read as 'images' to the onboarding step.
 *
 * A per-page glyph font is not a picture — it keeps one element per word, so
 * highlighting survives — but it is unsearchable and cannot be read aloud,
 * which is the distinction this step is actually making for the reader.
 * Calling it 'text' here would tell them something untrue about the thing
 * they most need to know.
 */
const asChoice = (e: Edition): EditionChoice => ({
  id: e.id,
  name: e.name,
  nameAr: e.nameAr,
  description: e.description,
  kind: e.kind === 'text' ? 'text' : 'images',
})

export function editions(): EditionChoice[] {
  return EDITIONS.map(asChoice)
}

export const defaultEdition = (): string => DEFAULT_EDITION

/** The reader's own script for the name, falling back to the Latin one. */
export const editionName = (e: EditionChoice, lang: Lang): string =>
  inScript(lang, e.nameAr, e.name)
