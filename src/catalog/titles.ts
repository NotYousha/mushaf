import data from '../../data/titles.json'
import type { Lang } from '../i18n'

/**
 * How each reciter is styled, and what office he holds.
 *
 * Two forms, because a list and a player want different things. `short` is
 * the honorific that sits in front of a name in a grid — "Sh. Dr.", الشيخ د.
 * `full` is the office, which belongs where there is room to read it.
 *
 * Researched against the Presidency of Religious Affairs' own rosters, which
 * publish each man's exact honorific, and anyone who could not be verified
 * was left out rather than guessed at. A missing entry is normal and the
 * caller must handle it: these are living scholars, and the app puts their
 * names against recitations of the Quran, so a wrong title is worse than
 * none. See docs/titles.md.
 */
type Titled = {
  short: Record<string, string>
  full: Record<string, string>
  source?: string
}

const titles = data as unknown as Record<string, Titled>

/** The honorific alone, or null where the man is not in the file. */
export const shortTitle = (id: string, lang: Lang): string | null =>
  titles[id]?.short?.[lang] ?? null

/** The office alone, or null. Never includes the name. */
export const fullTitle = (id: string, lang: Lang): string | null =>
  titles[id]?.full?.[lang] ?? null

/**
 * A name with its honorific in front, or the name unchanged.
 *
 * The honorific is a prefix in all five languages, so this is a join rather
 * than a template — but it is one place, so if that ever stops being true
 * there is somewhere to say so.
 */
export function styled(id: string, lang: Lang, name: string): string {
  const s = shortTitle(id, lang)
  return s ? `${s} ${name}` : name
}
