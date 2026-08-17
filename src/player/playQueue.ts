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
