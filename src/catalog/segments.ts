import segmentData from '../../data/segments.json'
import imamRoster from '../../data/imams.json'
import type { Place } from './mosques'

/**
 * Where a surah changes hands, and to whom.
 *
 * A Taraweeh surah is a stitch. Al-Baqarah spans most of the month and passes
 * between seven or eight imams, so naming one reciter for the whole file says
 * something untrue for an hour and three quarters of it. These are the
 * changeover times, published as a chapter list against the same recording the
 * app plays — see scripts/build-segments.mjs.
 *
 * Only the years that publish them have them. A surah with no entry here is
 * either a single reciter's — which data/voices.json already names — or one
 * whose changeovers were never written down, and in both cases the whole-surah
 * attribution stands rather than a guess being made.
 */

/** `[secondsFromStart, imamId]`, in order. */
export type Segment = [number, string]

const segments = segmentData as unknown as Record<string, Record<string, Segment[]>>
type Frame = { zoom: number; x: number; y: number }
const roster = imamRoster as Record<
  string,
  {
    name: string
    nameEn: string
    photo?: string
    frames?: { player?: Frame; card?: Frame }
  }
>

const keyOf = (place: Place, year: number) => `${place}-${year}`

/** The changeovers within a surah, or null where none are published. */
export function segmentsFor(
  place: Place,
  year: number,
  surah: number,
): Segment[] | null {
  const list = segments[keyOf(place, year)]?.[String(surah)]
  return list?.length ? list : null
}

/**
 * Who is reciting at this moment.
 *
 * The last changeover at or before the given time — a stretch runs until the
 * next one starts, which is what following a recitation needs. Before the
 * first changeover the first reciter holds: the seconds of silence and the
 * basmalah at the head of a file belong to whoever opens it.
 */
export function imamAt(
  place: Place,
  year: number,
  surah: number,
  seconds: number,
): string | null {
  const list = segmentsFor(place, year, surah)
  if (!list) return null
  let id: string | null = list[0][1]
  for (const [at, who] of list) {
    if (at > seconds) break
    id = who
  }
  return id
}

/** The next changeover strictly after this moment, for stepping forward. */
export function nextChangeAfter(
  place: Place,
  year: number,
  surah: number,
  seconds: number,
): { at: number; id: string } | null {
  const list = segmentsFor(place, year, surah)
  if (!list) return null
  const here = imamAt(place, year, surah, seconds)
  for (const [at, id] of list) {
    // A stretch by the same reciter is not a change to step to.
    if (at > seconds + 0.5 && id !== here) return { at, id }
  }
  return null
}

/** The previous changeover, for stepping back. */
export function prevChangeBefore(
  place: Place,
  year: number,
  surah: number,
  seconds: number,
): { at: number; id: string } | null {
  const list = segmentsFor(place, year, surah)
  if (!list) return null
  const here = imamAt(place, year, surah, seconds)
  let found: { at: number; id: string } | null = null
  for (const [at, id] of list) {
    if (at < seconds - 2 && id !== here) found = { at, id }
  }
  return found
}

export const imamName = (id: string | null) => (id ? (roster[id] ?? null) : null)
