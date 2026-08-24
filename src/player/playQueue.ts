export type RepeatMode = 'off' | 'one' | 'all'

/**
 * Next surah to play. `available` holds only surahs that are downloaded, so
 * continuous play skips unreleased and undownloaded ones rather than stalling.
 */
export function nextSurah(
  current: number,
  mode: RepeatMode,
  available: number[],
): number | null {
  if (!available.length) return null
  if (mode === 'one') return current
  const sorted = [...available].sort((a, b) => a - b)
  const next = sorted.find((s) => s > current)
  if (next !== undefined) return next
  return mode === 'all' ? sorted[0] : null
}

export function prevSurah(current: number, available: number[]): number | null {
  if (!available.length) return null
  const sorted = [...available].sort((a, b) => a - b)
  const before = sorted.filter((s) => s < current)
  return before.length ? before[before.length - 1] : null
}

/**
 * The next surah a different imam recites, in either direction.
 *
 * On a Taraweeh year the voice changes between surahs rather than at a fixed
 * interval, so "next reciter" is a real place to jump to and not a guess: the
 * next surah whose attribution differs from the one playing.
 *
 * A surah that spanned several nights carries several names at once, and any
 * change in that set counts as a change of voice — going from Baleela alone
 * to Baleela and Ash-Shamsan is a different thing to be listening to.
 *
 * Returns null when nothing further differs, which is what disables the
 * control rather than letting it jump somewhere arbitrary.
 */
export function nextVoiceChange(
  current: number,
  available: number[],
  voiceOf: (surah: number) => string | null,
  direction: 1 | -1 = 1,
): number | null {
  const here = voiceOf(current)
  // Nothing to step through on an entry that names no reciters at all.
  if (here === null) return null
  const sorted = [...available].sort((a, b) => a - b)
  const ahead =
    direction > 0
      ? sorted.filter((s) => s > current)
      : sorted.filter((s) => s < current).reverse()
  for (const s of ahead) {
    const v = voiceOf(s)
    if (v && v !== here) return s
  }
  return null
}
