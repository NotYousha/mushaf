import { describe, it, expect } from 'vitest'
import { branchTimes, rankForks, type Fork } from '../src/hifz/forks'
import type { Timings } from '../src/mushaf/data'

const timings: Timings = {
  unit: 'ms',
  source: 'test',
  surahs: {
    // Ten words, one per second.
    '4': [
      [48, [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000]],
      [116, [0, 1000, 2000, 3000, 4000, 5000]],
    ],
  },
}

const fork: Fork = {
  n: 3,
  text: 'shared phrase',
  at: [
    { s: 4, a: 48, w: 2, next: 'alpha' },
    { s: 4, a: 116, w: 1, next: 'beta' },
  ],
}

describe('fork branch timing', () => {
  it('cuts exactly where the two passages part', () => {
    const b = branchTimes(timings, fork, fork.at[0])!
    // Starts on word 2, shares three words, so the split is on word 5.
    expect(b.from).toBe(1)
    expect(b.cut).toBe(4)
  })

  it('plays a little past the split so the branch is audible', () => {
    const b = branchTimes(timings, fork, fork.at[0])!
    expect(b.after).toBeGreaterThan(b.cut)
    // Two words past, not the rest of the passage.
    expect(b.after).toBe(6)
  })

  it('still gives an audible tail when the ayah ends at the split', () => {
    const short: Fork = { n: 3, text: 'x', at: [{ s: 4, a: 116, w: 1, next: null }] }
    const b = branchTimes(timings, short, short.at[0])!
    expect(b.cut).toBe(3)
    expect(b.after).toBeGreaterThan(b.cut)
  })

  it('reports nothing for a passage the timings do not cover', () => {
    const missing: Fork = { n: 3, text: 'x', at: [{ s: 9, a: 1, w: 1, next: 'z' }] }
    expect(branchTimes(timings, missing, missing.at[0])).toBeNull()
  })

  it('reports nothing when the shared phrase runs past the ayah', () => {
    const tooLong: Fork = { n: 40, text: 'x', at: [{ s: 4, a: 48, w: 1, next: 'z' }] }
    expect(branchTimes(timings, tooLong, tooLong.at[0])).toBeNull()
  })

  it('reports nothing without timings at all', () => {
    expect(branchTimes(null, fork, fork.at[0])).toBeNull()
  })
})

describe('choosing which fork to drill', () => {
  const a: Fork = { n: 4, text: 'a', at: [{ s: 2, a: 27, w: 1, next: 'x' }] }
  const b: Fork = { n: 9, text: 'b', at: [{ s: 7, a: 5, w: 1, next: 'y' }] }
  const c: Fork = { n: 5, text: 'c', at: [{ s: 3, a: 12, w: 1, next: 'z' }] }

  it('puts a fork you have stumbled near first, however short', () => {
    // A drill aimed at a mistake actually made beats a longer, rarer one.
    const ranked = rankForks([a, b, c], ['2:27:4'])
    expect(ranked[0]).toBe(a)
  })

  it('prefers the longer shared phrase when nothing is marked', () => {
    // The further you travel before the split, the easier it is to go wrong.
    expect(rankForks([a, b, c], [])[0]).toBe(b)
  })

  it('matches a stumble anywhere in the ayah, not just on the word', () => {
    expect(rankForks([a, b, c], ['3:12:99'])[0]).toBe(c)
  })

  it('leaves the input untouched', () => {
    const input = [a, b, c]
    rankForks(input, [])
    expect(input).toEqual([a, b, c])
  })
})
