import data from '../../data/mosque-years.json'
import imamRoster from '../../data/imams.json'
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
const roster = imamRoster as Record<string, { name: string; nameEn: string }>

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
      /**
       * Nothing here is asserted, because nothing can be.
       *
       * Several imams led each of these Ramadans and no source records which
       * surah is whose, so the seconds-per-letter check cannot be run per
       * voice — one median across several paces deletes good recordings
       * rather than finding wrong ones. Every surah therefore asks for an ear
       * check, and effectiveVerified() lets a listener settle one for good.
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
