import data from '../../data/mosque-years.json'
import imamRoster from '../../data/imams.json'
import voiceMap from '../../data/voices.json'
import type { Reciter } from './types'

/**
 * The two mosques, one entry per Ramadan.
 *
 * Each year is that Ramadan's Taraweeh and Tahajjud, assembled from an
 * archive.org item. They are expanded here rather than stored in
 * data/catalog.json because only the byte count varies per surah — the URL is
 * a pure function of mosque, year and surah — and the catalog's
 * one-object-per-surah shape would add close to 1.5 MB to a file that ships
 * inside the JS bundle. See scripts/build-mosque-years.mjs, which also
 * documents why particular years are not here at all.
 *
 * Everything downstream sees ordinary Reciter objects and neither knows nor
 * cares that these were folded up on disk.
 */

const WORKER = 'https://mushaf-audio.mushaftarteel.workers.dev'

/**
 * The Taraweeh years come straight from archive.org, not through the proxy.
 *
 * This is the bulk of the app — thirty-odd Ramadans of both mosques, a couple
 * of gigabytes each — and it does not need a proxy at all. Archive.org answers
 * `Access-Control-Allow-Origin: *`, and every file in these items is named
 * `001.mp3` .. `114.mp3`, so the URL is a pure function of the year and the
 * surah with nothing to resolve. Sending it through a Worker cost a request
 * per 2 MB chunk — about fifteen hundred for one year — against a free plan
 * with a daily cap, for no benefit but a header the app can live without.
 *
 * What it does cost: Content-Range is not CORS-safelisted and archive.org does
 * not expose it, so a cross-origin read of it is null and the download cannot
 * learn the file's length from the response. It takes the length from the
 * catalog instead — see ChunkedOpts.totalBytes, which exists for this.
 *
 * `/download/` rather than a node hostname: nodes rotate and individual ones
 * go unhealthy, and that path always redirects to a live one.
 */
const ARCHIVE = 'https://archive.org/download'

/**
 * The one year that still needs the proxy.
 *
 * Madinah 1446 is served from a different item than its name implies, because
 * the obvious one holds a sped-up edit, and that item's files are named in
 * Arabic — `002 - البقرة .mp3` — so the name has to be read from the item's
 * metadata rather than built from the surah number. That is a lookup, which is
 * what the Worker is for. One year of thirty-three.
 */
const NEEDS_PROXY = new Set(['nabawi-1446'])

export type Place = 'makkah' | 'madinah'

type YearRow = { year: number; ce: number | null; imams: string[]; bytes: number[]; secs: number[] }
type Doc = { mosques: Record<Place, YearRow[]>; excluded: Record<Place, Record<string, string>> }

const doc = data as unknown as Doc
type Frame = { zoom: number; x: number; y: number }
const roster = imamRoster as Record<
  string,
  {
    name: string
    nameEn: string
    photo?: string
    serves?: string[]
    /**
     * How a bundled portrait is framed, per surface.
     *
     * Carried here rather than baked into the pixels so one file serves both
     * the player's circle and the dock's small square, and so a crop can be
     * adjusted later without the original having been thrown away.
     */
    frames?: { player?: Frame; card?: Frame }
  }
>
/** surah -> the imams who recited it, for the years that publish it. */
const voices = voiceMap as Record<string, Record<string, string[]>>

export const PLACES: {
  place: Place
  /** Kept as 'haram' for Makkah: it is in the URLs of audio people have
   *  already saved, and renaming it would orphan every one of them. */
  route: string
  /**
   * The archive.org item prefix, which the year is appended to.
   *
   * Deliberately not the same string as `route`: the route is ours and is
   * frozen into saved URLs, the item is the archive's and is capitalised the
   * way the uploader capitalised it. The Worker's MOSQUES table has to agree
   * with this — it still serves Madinah 1446.
   */
  item: string
  ar: string
  en: string
  shortAr: string
  shortEn: string
}[] = [
  {
    place: 'makkah',
    route: 'haram',
    item: 'Mecca',
    ar: 'المسجد الحرام',
    en: 'The Grand Mosque',
    shortAr: 'تراويح الحرم',
    shortEn: 'Haram Taraweeh',
  },
  {
    place: 'madinah',
    route: 'nabawi',
    item: 'Nabawi',
    ar: 'المسجد النبوي',
    en: "The Prophet's Mosque",
    shortAr: 'تراويح النبوي',
    shortEn: 'Nabawi Taraweeh',
  },
]

const meta = (place: Place) => PLACES.find((p) => p.place === place)!

export const mosqueId = (place: Place, year: number) => `${meta(place).route}-${year}`

/** ١٤٤٧ rather than 1447, to sit correctly beside the Arabic around it. */
export const arabicDigits = (n: number | string) =>
  String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)])

const rowsOf = (place: Place): YearRow[] => doc.mosques[place] ?? []

/** The imams who led that year, in the roster's own spelling. */
export function imamsOf(
  place: Place,
  year: number,
): { id: string; name: string; nameEn: string; photo?: string }[] {
  return (rowsOf(place).find((r) => r.year === year)?.imams ?? [])
    .map((id) => (roster[id] ? { ...roster[id], id } : null))
    .filter((x): x is { id: string; name: string; nameEn: string; photo?: string } => !!x)
}

/** Why a year is missing, for anyone who goes looking for it. */
/**
 * How long a surah runs in a given year, in seconds, or null where the build
 * could not read a duration.
 *
 * Published by the build alongside the byte counts and otherwise unused. It is
 * what lets a reciter's page say how much of him there is to hear, and what
 * gives an unbounded stretch of a shared surah an end.
 */
export function surahSeconds(place: Place, year: number, surah: number): number | null {
  const secs = rowsOf(place).find((r) => r.year === year)?.secs?.[surah - 1]
  return typeof secs === 'number' && secs > 0 ? secs : null
}

export const excludedYears = (place: Place) => doc.excluded?.[place] ?? {}

export type Imam = {
  id: string
  name: string
  nameEn: string
  /** A portrait shipped with the app, for the few we have one for. */
  photo?: string
  /** How that portrait is framed, where it needs more than the default. */
  frames?: { player?: Frame; card?: Frame }
  /** Which mosque or mosques he led at. */
  serves: Place[]
}

/**
 * Everyone who leads in any published year, grouped by mosque and ordered by
 * how many surahs they actually recite — so the names a listener meets most
 * are the ones at the top of a settings list.
 *
 * The roster itself is keyed by id and private; this is the way out of it.
 */
export function allImams(): Imam[] {
  const weight = new Map<string, number>()
  for (const map of Object.values(voices)) {
    for (const ids of Object.values(map)) {
      for (const id of ids) weight.set(id, (weight.get(id) ?? 0) + 1)
    }
  }
  // Everyone named on a year counts, even where no surah-level map exists.
  for (const place of ['makkah', 'madinah'] as Place[]) {
    for (const row of rowsOf(place)) {
      for (const id of row.imams) if (!weight.has(id)) weight.set(id, 0)
    }
  }
  return Object.entries(roster)
    .filter(([id]) => weight.has(id))
    .map(([id, who]) => ({
      id,
      name: who.name,
      nameEn: who.nameEn,
      photo: who.photo,
      frames: who.frames,
      serves: (who.serves ?? []) as Place[],
    }))
    .sort((a, b) => (weight.get(b.id) ?? 0) - (weight.get(a.id) ?? 0))
}


/**
 * Who recited this surah, where that is published.
 *
 * A surah spanning several nights genuinely has several reciters — Al-Baqarah
 * always does — so the names are joined rather than one being picked. The
 * portrait only travels with a surah a single imam recited: a face is a claim
 * about one person, and there is no honest way to show seven at once.
 */
function voiceFields(place: Place, year: number, surah: number) {
  const ids = voices[`${place}-${year}`]?.[String(surah)]
  if (!ids?.length) return {}
  const who = ids.map((id) => roster[id]).filter(Boolean)
  if (!who.length) return {}
  return {
    voice: who.map((w) => w.name).join(' · '),
    voiceEn: who.map((w) => w.nameEn).join(' · '),
    // The id travels with the portrait: the medallion's crop is keyed to it
    // in CSS, because the shipped images are framed differently from each
    // other and one set of values does not suit them all.
    ...(who.length === 1 && who[0].photo
      ? { voicePhoto: who[0].photo, voiceId: ids[0] }
      : {}),
  }
}

function toReciter(place: Place, row: YearRow): Reciter {
  const m = meta(place)
  const ar = arabicDigits(row.year)
  return {
    id: mosqueId(place, row.year),
    name: `${m.ar} ${ar}`,
    nameEn: `${m.en} ${row.year}`,
    fullName: `تراويح وتهجد ${m.ar} ${ar}`,
    mushaf: `المصحف الصوتي من صلاتي التراويح والتهجد ${m.ar} ${ar}`,
    mushafEn: `Taraweeh and Tahajjud at ${m.en}, ${row.year}${row.ce ? ` (${row.ce})` : ''}`,
    source: `archive.org, via the mushaf-audio Worker`,
    note: 'تلاوات لأئمة متعددين — لم تُنسب كل سورة إلى قارئها.',
    // A compilation has no one face, and picking any single imam's would
    // misrepresent everyone else who led that year.
    photo: null,
    // Held out of the reciter strip: fifty-six more chips would bury the four
    // individual mushafs that belong there.
    group: place,
    year: row.year,
    ce: row.ce,
    released: 114,
    total: 114,
    surahs: row.bytes.map((bytes, i) => ({
      surah: i + 1,
      url: NEEDS_PROXY.has(`${m.route}-${row.year}`)
        ? `${WORKER}/${m.route}/${row.year}/${i + 1}.mp3`
        : `${ARCHIVE}/${m.item}${row.year}/${String(i + 1).padStart(3, '0')}.mp3`,
      fallbackUrl: null,
      bytes,
      ...voiceFields(place, row.year, i + 1),
      /**
       * Still unasserted, even where the reciter is now known.
       *
       * Knowing who recited a surah is not the same as having checked that
       * this file holds that recitation. The per-voice length check needs
       * enough surahs per imam to have a median worth comparing against, and
       * most years publish no attribution at all. So every surah continues to
       * ask for an ear, and effectiveVerified() lets a listener settle one.
       *
       * The build script does screen each item as a whole, which is what
       * caught the years that are missing entirely.
       */
      verified: false,
    })),
  }
}

/** Newest first: the year someone wants is nearly always the last one. */
export const mosqueReciters = (): Reciter[] =>
  PLACES.flatMap((m) =>
    [...rowsOf(m.place)].sort((a, b) => b.year - a.year).map((r) => toReciter(m.place, r)),
  )
