import { getPref, setPref } from '../db/prefs'
import type { SurahView } from './types'

export type Verdict = 'ok' | 'wrong'
const KEY = 'verdicts'

export async function getVerdicts(): Promise<Record<number, Verdict>> {
  return getPref<Record<number, Verdict>>(KEY, {})
}

export async function setVerdict(surah: number, v: Verdict) {
  const all = await getVerdicts()
  all[surah] = v
  await setPref(KEY, all)
}

/**
 * A user's own ear beats the catalog's size-match heuristic, in both
 * directions: it can confirm an unverified entry or reject a "verified" one.
 */
export function effectiveVerified(
  s: SurahView,
  verdicts: Record<number, Verdict>,
): boolean {
  const v = verdicts[s.surah]
  if (v) return v === 'ok'
  return s.verified
}
