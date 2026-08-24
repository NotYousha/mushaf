import type { Reciter } from './types'
import type { Lang } from '../i18n'
import { inScript } from '../i18n/script'

/**
 * Everything here is built on the Hafs text: the bundled Quran, the mushaf
 * page layout, the word timings, and the fork index. A reciter reading a
 * different riwayah is reciting different wording, so those features must
 * stand down for them rather than show a page that quietly disagrees with
 * what is being recited.
 */
export const isHafs = (r: Reciter | null | undefined) => !r?.riwayah

/** The riwayah as it should appear beside the reciter's name, in brackets. */
export function riwayahLabel(r: Reciter | null | undefined, lang: Lang): string | null {
  if (!r?.riwayah) return null
  return inScript(lang, r.riwayah, r.riwayahEn)
}
