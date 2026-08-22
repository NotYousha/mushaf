import { loadTimings, type Timings } from '../mushaf/data'

/**
 * The Fork Drill.
 *
 * The most common hifz error is taking the wrong branch: a phrase occurs in
 * more than one place and the mouth carries on into the wrong one. Every
 * other tool shows this as a text diff in two columns — but the mistake does
 * not happen on the page. It happens in the mouth, at speed, in prayer, in
 * the dark. So the drill is made of audio: hear the shared phrase, get cut
 * off exactly at the word where the paths part, and supply the next word
 * yourself.
 */

/** One place a shared phrase occurs. */
export type ForkAt = {
  s: number
  a: number
  w: number
  /** The word that follows here — what makes this branch different. */
  next: string | null
}

export type Fork = {
  /** How many words the branches share before parting. */
  n: number
  text: string
  at: ForkAt[]
}

type ForksFile = { version: string; forks: Fork[] }

let forksPromise: Promise<Fork[]> | null = null

export const loadForks = () => {
  forksPromise ??= import('../../data/forks.json').then(
    (m) => (m.default as unknown as ForksFile).forks,
  )
  return forksPromise
}

/** Where a branch begins and where it is cut off, in seconds. */
export type Branch = {
  at: ForkAt
  /** Start of the shared phrase. */
  from: number
  /** The moment the paths part — playback stops here. */
  cut: number
  /** A little past the divergence, enough to hear which way it went. */
  after: number
}

/** Word start times for one ayah, in ms, or null if this ayah is not timed. */
function ayahWords(timings: Timings, surah: number, ayah: number): number[] | null {
  const verses = timings.surahs[String(surah)]
  if (!verses) return null
  const hit = verses.find(([a]) => a === ayah)
  return hit ? hit[1] : null
}

/**
 * Turn one occurrence into playable times.
 *
 * Returns null when the audio timings do not cover this passage, which is the
 * normal case for a reciter nobody has aligned — the drill simply has nothing
 * to play and the caller skips the fork.
 */
export function branchTimes(
  timings: Timings | null,
  fork: Fork,
  at: ForkAt,
): Branch | null {
  if (!timings) return null
  const words = ayahWords(timings, at.s, at.a)
  if (!words) return null

  // Fork positions are 1-based word numbers within the ayah.
  const start = words[at.w - 1]
  const cut = words[at.w - 1 + fork.n]
  if (typeof start !== 'number' || typeof cut !== 'number') return null

  // Two words past the split is enough to hear which way it went without
  // giving away the rest of the passage.
  const afterIdx = Math.min(words.length - 1, at.w - 1 + fork.n + 2)
  const after = words[afterIdx]

  return {
    at,
    from: start / 1000,
    cut: cut / 1000,
    after: (typeof after === 'number' && after > cut ? after : cut + 2500) / 1000,
  }
}

/** A fork that can actually be played, with both of its branches timed. */
export type Drill = {
  fork: Fork
  branches: Branch[]
}

export async function buildDrill(
  reciterId: string,
  fork: Fork,
): Promise<Drill | null> {
  const timings = await loadTimings(reciterId)
  if (!timings) return null
  const branches = fork.at
    .map((a) => branchTimes(timings, fork, a))
    .filter((b): b is Branch => b !== null)
  // A fork with one playable branch is not a fork: there is nothing to
  // confuse it with.
  return branches.length >= 2 ? { fork, branches } : null
}

/**
 * Choose which fork to drill.
 *
 * Forks the reader has actually stumbled near come first, because a drill
 * aimed at a mistake you have really made is worth more than a longer or
 * rarer one. Among equals, the longer shared phrase wins: the further you
 * travel before the split, the easier it is to take the wrong branch.
 */
export function rankForks(forks: Fork[], stumbleKeys: Iterable<string>): Fork[] {
  const hurt = new Set<string>()
  for (const key of stumbleKeys) {
    const [s, a] = key.split(':')
    hurt.add(`${s}:${a}`)
  }
  const score = (f: Fork) => {
    const near = f.at.some((p) => hurt.has(`${p.s}:${p.a}`)) ? 1000 : 0
    return near + f.n
  }
  return [...forks].sort((x, y) => score(y) - score(x))
}
