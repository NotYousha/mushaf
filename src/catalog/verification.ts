import { getPref, setPref } from '../db/prefs'
import type { SurahView } from './types'

export type Verdict = 'ok' | 'wrong'
const KEY = 'verdicts'

const vkey = (reciterId: string, surah: number) => `${reciterId}:${surah}`

export async function getVerdicts(): Promise<Record<string, Verdict>> {
  return getPref<Record<string, Verdict>>(KEY, {})
}

export async function setVerdict(reciterId: string, surah: number, v: Verdict) {
  const all = await getVerdicts()
  all[vkey(reciterId, surah)] = v
  await setPref(KEY, all)
}

/**
 * A listener's own ear beats the catalog's size-match heuristic, in both
 * directions: it can confirm an unverified entry or reject a "verified" one.
 */
export function effectiveVerified(
  reciterId: string,
  s: SurahView,
  verdicts: Record<string, Verdict>,
): boolean {
  const v = verdicts[vkey(reciterId, s.surah)]
  if (v) return v === 'ok'
  return s.verified
}
