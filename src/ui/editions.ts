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
/**
 * Three, because an edition can lose these things separately.
 *
 * - `text` — live Unicode. Loses nothing: word highlighting, search and a
 *   screen reader all work.
 * - `glyphs` — a per-page font in the private use area. **Keeps** word
 *   following, because it is still one element per word; loses search and
 *   speech, because every codepoint is private.
 * - `images` — pictures of pages. Loses all three.
 *
 * This was briefly two values, with `glyphs` flattened onto `images`. That
 * read the same on screen and was wrong in the field: `kind` is what a later
 * caller consults to decide whether to offer search or skip a screen-reader
 * path, and a glyph edition would have had its highlighting turned off for no
 * reason. Nothing ships as anything but `text` today, which is exactly why it
 * was worth correcting before something depends on it.
 */
export type EditionKind = 'text' | 'glyphs' | 'images'

export type EditionChoice = {
  id: string
  name: string
  nameAr: string
  description: string
  /** What this edition can still do — see EditionKind. */
  kind: EditionKind
}

const asChoice = (e: Edition): EditionChoice => ({
  id: e.id,
  name: e.name,
  nameAr: e.nameAr,
  description: e.description,
  kind: e.kind,
})

export function editions(): EditionChoice[] {
  return EDITIONS.map(asChoice)
}

export const defaultEdition = (): string => DEFAULT_EDITION

/** The reader's own script for the name, falling back to the Latin one. */
export const editionName = (e: EditionChoice, lang: Lang): string =>
  inScript(lang, e.nameAr, e.name)
