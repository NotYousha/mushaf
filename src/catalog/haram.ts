import data from '../../data/haram-years.json'
import imamRoster from '../../data/imams.json'
import type { Reciter } from './types'

/**
 * The Grand Mosque's mushaf, one entry per year.
 *
 * Thirty-three Ramadans, 1414 through 1447, each assembled from that year's
 * Taraweeh and Tahajjud. They are expanded here rather than stored in
 * data/catalog.json because only the byte count varies per surah — the URL is
 * a pure function of year and surah — and the catalog's one-object-per-surah
 * shape would have added roughly 850 KB to a file that ships inside the JS
 * bundle. See scripts/build-haram-years.mjs.
 *
 * Everything downstream sees ordinary Reciter objects and neither knows nor
 * cares that these were folded up on disk.
 */

const WORKER = 'https://mushaf-audio.mushaftarteel.workers.dev'

type YearRow = { year: number; ce: number | null; imams: string[]; bytes: number[] }
const rows = (data as { years: YearRow[] }).years
const roster = imamRoster as Record<string, { name: string; nameEn: string }>

export const haramId = (year: number) => `haram-${year}`

/** ١٤٤٧ rather than 1447, to sit correctly beside the Arabic around it. */
export const arabicDigits = (n: number) =>
  String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)])

/** The imams who led that year, in the roster's own spelling. */
export const imamsOf = (year: number): { name: string; nameEn: string }[] =>
  (rows.find((r) => r.year === year)?.imams ?? []).map((id) => roster[id]).filter(Boolean)

function toReciter(row: YearRow): Reciter {
  const ar = arabicDigits(row.year)
  return {
    id: haramId(row.year),
    name: `الحرم المكي ${ar}`,
    nameEn: `Grand Mosque ${row.year}`,
    fullName: `تراويح وتهجد الحرم المكي ${ar}`,
    mushaf: `المصحف الصوتي من صلاتي التراويح والتهجد بالمسجد الحرام ${ar}`,
    mushafEn: `Taraweeh and Tahajjud at the Grand Mosque, ${row.year}${row.ce ? ` (${row.ce})` : ''}`,
    source: `archive.org item Mecca${row.year}, via the mushaf-audio Worker`,
    note: 'تلاوات لأئمة متعددين — لم تُنسب كل سورة إلى قارئها.',
    // A compilation has no one face, and picking any single imam's would
    // misrepresent the other six.
    photo: null,
    // Kept out of the reciter strip: thirty-three more chips would bury the
    // four mushafs that belong there. They get their own year list instead.
    group: 'haram',
    year: row.year,
    ce: row.ce,
    released: 114,
    total: 114,
    surahs: row.bytes.map((bytes, i) => ({
      surah: i + 1,
      url: `${WORKER}/haram/${row.year}/${i + 1}.mp3`,
      fallbackUrl: null,
      bytes,
      /**
       * Nothing here is asserted, because nothing can be.
       *
       * Several imams led each of these Ramadans and no source records which
       * surah is whose — not the archive items, not their files' tags, not
       * the collection listings on tilawatalharamain, whose per-surah pages
       * carry an empty placeholder where the name would go. Without that map
       * the seconds-per-letter check would have to take one median across
       * several different paces, which deletes good recordings rather than
       * finding wrong ones. So every surah asks for an ear check, and
       * effectiveVerified() lets a listener settle one for good.
       */
      verified: false,
    })),
  }
}

/** Newest first: the year someone wants is nearly always the last one. */
export const haramReciters = (): Reciter[] =>
  [...rows].sort((a, b) => b.year - a.year).map(toReciter)
