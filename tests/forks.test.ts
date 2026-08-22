import { describe, it, expect } from 'vitest'
import forks from '../data/forks.json'

describe('data/forks.json', () => {
  it('parses into the documented shape', () => {
    expect(forks.version).toBe('1')
    expect(Array.isArray(forks.forks)).toBe(true)
    expect(forks.forks.length).toBeGreaterThan(500)
  })

  it('never reports a shared sequence shorter than 4 words', () => {
    for (const f of forks.forks) {
      expect(f.n).toBeGreaterThanOrEqual(4)
      expect(f.text.trim().split(/\s+/)).toHaveLength(f.n)
    }
  })

  it('gives every fork at least two positions', () => {
    for (const f of forks.forks) {
      expect(f.at.length).toBeGreaterThanOrEqual(2)
    }
  })

  // The whole point of a fork is the divergence: without at least two
  // different next words, it is just an ordinary repeated phrase.
  it('has at least two distinct next-words in every fork', () => {
    for (const f of forks.forks) {
      const nexts = new Set(f.at.map((p) => p.next))
      expect(nexts.size).toBeGreaterThanOrEqual(2)
    }
  })

  it('sorts forks by descending n, then by first position', () => {
    const rank = (f: (typeof forks.forks)[number]) => [-f.n, f.at[0].s, f.at[0].a, f.at[0].w]
    for (let i = 1; i < forks.forks.length; i++) {
      const prev = rank(forks.forks[i - 1])
      const cur = rank(forks.forks[i])
      let cmp = 0
      for (let k = 0; k < prev.length && cmp === 0; k++) cmp = prev[k] - cur[k]
      expect(cmp).toBeLessThanOrEqual(0)
    }
  })

  it('keeps every position within a real surah/ayah range', () => {
    for (const f of forks.forks) {
      for (const p of f.at) {
        expect(p.s).toBeGreaterThanOrEqual(1)
        expect(p.s).toBeLessThanOrEqual(114)
        expect(p.a).toBeGreaterThanOrEqual(1)
        expect(p.w).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('excludes the basmala itself as a bare 4-word fork', () => {
    const strip = (s: string) =>
      s
        .replace(/\p{Mn}/gu, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
    const basmalaAyah = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ'
    const basmala = strip(basmalaAyah)
    const bare = forks.forks.find((f) => f.n === 4 && strip(f.text) === basmala)
    expect(bare).toBeUndefined()
  })

  // 4:48 and 4:116 are the single most notorious wrong-branch pair in the
  // Quran: identical for 17 words, "man yushrik billahi faqad ..." then one
  // says "iftara ithman 'azima" and the other "dalla dalalan ba'eeda". Any
  // fork index that misses this has a correctness bug, not a style gap.
  it('catches the an-Nisa 4:48 / 4:116 shirk-warning fork', () => {
    const hit = forks.forks.find(
      (f) => f.at.some((p) => p.s === 4 && p.a === 48) && f.at.some((p) => p.s === 4 && p.a === 116),
    )
    expect(hit).toBeDefined()
    expect(hit!.n).toBeGreaterThanOrEqual(17)
    const nexts = new Set(hit!.at.map((p) => p.next))
    expect(nexts.size).toBeGreaterThanOrEqual(2)
  })

  // 4:43 and 5:6 share the tayammum instructions for 24 straight words
  // before diverging — the longest fork in the whole index, and a real
  // point where reciters bleed from one surah into the other.
  it('catches the tayammum 4:43 / 5:6 fork as the longest entry', () => {
    const hit = forks.forks.find(
      (f) => f.at.some((p) => p.s === 4 && p.a === 43) && f.at.some((p) => p.s === 5 && p.a === 6),
    )
    expect(hit).toBeDefined()
    expect(hit!.n).toBe(forks.forks[0].n)
  })
})
