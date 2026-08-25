import voiceMap from '../../data/voices.json'
import segmentData from '../../data/segments.json'
import imamRoster from '../../data/imams.json'
import type { Place } from './mosques'
import type { Segment } from './segments'

/**
 * The archive read backwards: from a reciter to everything he recited.
 *
 * Both attribution files are otherwise consumed in one direction only — surah
 * and time in, a name out, to label the line that says who is reciting. Turned
 * around, the same data answers the question the archive is actually for:
 * play me this sheikh. Six and a half thousand recordings stop being a list of
 * years and become a library.
 *
 * Nothing else can do this, because it needs per-surah attribution across
 * years, which no one else has assembled.
 */

type Voices = Record<string, Record<string, string[]>>
type Segments = Record<string, Record<string, Segment[]>>

const voices = voiceMap as unknown as Voices
const segments = segmentData as unknown as Segments
const roster = imamRoster as Record<
  string,
  { name: string; nameEn: string; photo?: string; serves?: string[] }
>

/** One stretch of recitation: a whole surah, or part of one. */
export type Reading = {
  place: Place
  year: number
  /** The reciter entry id, so this is playable without further lookup. */
  reciterId: string
  surah: number
  /** Seconds into the file where his part begins. */
  from: number
  /**
   * Seconds where it ends, when the surah changes hands again. Null means to
   * the end of the recording — which is most of them.
   */
  to: number | null
  /** Whether he recites the whole file or a stretch of it. */
  whole: boolean
}

const routeOf = (place: Place) => (place === 'makkah' ? 'haram' : 'nabawi')

function splitKey(key: string): { place: Place; year: number } | null {
  const at = key.lastIndexOf('-')
  if (at < 1) return null
  const place = key.slice(0, at) as Place
  const year = Number(key.slice(at + 1))
  if (!Number.isInteger(year)) return null
  return { place, year }
}

/**
 * Every stretch this imam recites, in the order a listener would hear them.
 *
 * A surah with published changeover times yields only his stretches of it,
 * with their start and end; a surah without them yields the whole file, which
 * is the honest answer when nothing says where he begins.
 */
export function readingsOf(imamId: string): Reading[] {
  const out: Reading[] = []

  for (const [key, surahs] of Object.entries(voices)) {
    const parsed = splitKey(key)
    if (!parsed) continue
    const { place, year } = parsed
    const reciterId = `${routeOf(place)}-${year}`

    for (const [surahStr, ids] of Object.entries(surahs)) {
      if (!ids.includes(imamId)) continue
      const surah = Number(surahStr)
      const stretches = segments[key]?.[surahStr]

      if (!stretches?.length) {
        // No changeovers published. If he is the only name on the surah it is
        // his outright; if he shares it, the file is still the smallest thing
        // that certainly contains him.
        out.push({ place, year, reciterId, surah, from: 0, to: null, whole: true })
        continue
      }

      stretches.forEach(([at, who], i) => {
        if (who !== imamId) return
        const next = stretches[i + 1]
        out.push({
          place,
          year,
          reciterId,
          surah,
          from: at,
          to: next ? next[0] : null,
          whole: stretches.length === 1,
        })
      })
    }
  }

  return out.sort((a, b) => b.year - a.year || a.surah - b.surah || a.from - b.from)
}

export type ImamSummary = {
  id: string
  name: string
  nameEn: string
  photo?: string
  /** Distinct surahs he recites any part of. */
  surahs: number
  /** Separate stretches, which is larger wherever a surah changes hands. */
  readings: number
  years: number[]
  /** Total listening time, where the durations are known. */
  seconds: number
}

/**
 * Everyone with attributed recitation, most-recited first.
 *
 * Ordered by how much of the Quran each man actually carries rather than
 * alphabetically: the names a listener meets most should be the ones at the
 * top of a list they are scanning.
 */
export function imamsWithReadings(durationOf: (
  place: Place,
  year: number,
  surah: number,
) => number | null): ImamSummary[] {
  const ids = new Set<string>()
  for (const surahs of Object.values(voices)) {
    for (const list of Object.values(surahs)) for (const id of list) ids.add(id)
  }

  return [...ids]
    .filter((id) => roster[id])
    .map((id) => {
      const readings = readingsOf(id)
      const years = [...new Set(readings.map((r) => r.year))].sort((a, b) => b - a)
      let seconds = 0
      for (const r of readings) {
        const total = durationOf(r.place, r.year, r.surah)
        if (total == null) continue
        seconds += (r.to ?? total) - r.from
      }
      return {
        id,
        name: roster[id].name,
        nameEn: roster[id].nameEn,
        photo: roster[id].photo,
        surahs: new Set(readings.map((r) => `${r.year}:${r.surah}`)).size,
        readings: readings.length,
        years,
        seconds,
      }
    })
    .sort((a, b) => b.surahs - a.surahs)
}
