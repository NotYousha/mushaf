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

export type Place = 'makkah' | 'madinah'

type YearRow = { year: number; ce: number | null; imams: string[]; bytes: number[]; secs: number[] }
type Doc = { mosques: Record<Place, YearRow[]>; excluded: Record<Place, Record<string, string>> }

const doc = data as unknown as Doc
const roster = imamRoster as Record<
  string,
  { name: string; nameEn: string; photo?: string }
>
/** surah -> the imams who recited it, for the years that publish it. */
const voices = voiceMap as Record<string, Record<string, string[]>>

export const PLACES: {
  place: Place
  /** Kept as 'haram' for Makkah: it is in the URLs of audio people have
   *  already saved, and renaming it would orphan every one of them. */
  route: string
  ar: string
  en: string
  shortAr: string
  shortEn: string
}[] = [
  {
    place: 'makkah',
    route: 'haram',
    ar: 'المسجد الحرام',
    en: 'The Grand Mosque',
    shortAr: 'تراويح الحرم',
    shortEn: 'Haram Taraweeh',
  },
  {
    place: 'madinah',
    route: 'nabawi',
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
export function imamsOf(place: Place, year: number): { name: string; nameEn: string }[] {
  return (rowsOf(place).find((r) => r.year === year)?.imams ?? [])
    .map((id) => roster[id])
    .filter(Boolean)
}

/** Why a year is missing, for anyone who goes looking for it. */
export const excludedYears = (place: Place) => doc.excluded?.[place] ?? {}


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
      url: `${WORKER}/${m.route}/${row.year}/${i + 1}.mp3`,
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
