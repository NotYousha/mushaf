/**
 * Judge each measured surah against the pace of its own voice.
 *
 * Seconds per letter is roughly constant for one reciter, which is what makes
 * it a usable check: a file whose length is wildly out of step with its text
 * does not contain the surah it claims to. It is how the four Burhaji files
 * holding each other's recitations were found.
 *
 * One median across a whole entry assumes one voice. A Taraweeh compilation
 * rotates imams, so a deliberate reciter and a quick one land on opposite
 * sides of a shared median and the gates delete legitimate recordings.
 * Grouping by voice keeps the check and drops the assumption.
 *
 * The band is deliberately not widened to absorb the difference. Loosening it
 * enough to cover several imams would have let the Burhaji files through,
 * since they were off by roughly that margin.
 */

/** Below this, a surah is dominated by the basmalah and by pauses —
 *  Al-Fatiha runs 1.35x its text length quite legitimately. */
export const MIN_LETTERS = 150

/** A median of fewer samples than this is a guess, not a pace. */
export const MIN_GROUP = 8

export const LOW = 0.69
export const HIGH = 1.45

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

/**
 * @param measured  iterable of [surah, { seconds }]; null seconds means the
 *                  file could not be parsed and carries no signal.
 * @param voiceOf   surah -> voice, or null for an entry with a single voice.
 * @param lettersIn surah -> count of Quranic letters in its text.
 */
export function judgeByVoice(measured, voiceOf, lettersIn) {
  const groups = new Map()

  for (const [surah, m] of measured) {
    if (m?.seconds == null) continue
    const letters = lettersIn(surah)
    if (letters < MIN_LETTERS) continue
    const rate = m.seconds / letters
    if (!Number.isFinite(rate) || rate <= 0) continue
    // A single-voice entry groups under one key rather than taking a
    // separate path, so there is only one behaviour to reason about.
    const voice = voiceOf(surah) ?? ''
    if (!groups.has(voice)) groups.set(voice, [])
    groups.get(voice).push({ surah, rate })
  }

  const mismatched = []
  const judged = new Set()
  const unjudged = []

  for (const [voice, members] of groups) {
    if (members.length < MIN_GROUP) {
      for (const m of members) unjudged.push(m.surah)
      continue
    }
    const med = median(members.map((m) => m.rate))
    for (const m of members) {
      judged.add(m.surah)
      const factor = m.rate / med
      if (factor > HIGH || factor < LOW) mismatched.push({ surah: m.surah, factor, voice })
    }
  }

  return { mismatched, judged, unjudged }
}
