/**
 * Builds data/forks.json: the "wrong branch" index for hifz drilling.
 *
 * The most common memorisation slip isn't forgetting a word, it's the mouth
 * continuing into a different ayah because the last few words it just said
 * are shared with that other place. So the unit we index isn't a repeated
 * phrase (that alone is not an error risk) but a repeated phrase whose next
 * word actually differs somewhere — the fork in the road.
 *
 * Matching is done on words stripped of diacritics/alef-variants, because a
 * reciter's ear is doing that normalisation whether they know it or not; the
 * diacritics are kept in the stored text since that's what the drill shows.
 *
 * Maximal-match selection: for every word position, compute the single
 * longest run starting there that also occurs starting somewhere else. A
 * shorter run starting at the same word is never a separate fork — it is by
 * definition a prefix of the longest one, so reporting it too would just be
 * the same wrong-branch moment reported twice at different zoom levels. The
 * one subtlety is that "longest run" can differ per position: if A and B
 * share 7 words but C only shares the first 4 with them, A/B's fork lives at
 * word 8 and C's fork lives at word 5 — both are real, and this scheme
 * produces both without extra bookkeeping, because C simply isn't part of
 * the length-7 group's position set.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const srcPath = root + 'data/quran-text.json'
const outPath = root + 'data/forks.json'

const quranText = JSON.parse(readFileSync(srcPath, 'utf8').replace(/﻿/g, ''))

// Uthmani script carries Quran-specific annotation marks (rounded-zero,
// small high seen, etc.) alongside ordinary tashkeel. \p{Mn} (Unicode
// "nonspacing mark") catches all of them in one sweep instead of hand-listing
// code point ranges that Uthmani text keeps adding exceptions to.
function normalize(word) {
  return word
    .replace(/\p{Mn}/gu, '')
    .replace(/ـ/g, '') // tatweel is a stylistic stretch, not a phoneme
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
}

const ayahs = []
for (let s = 1; s <= 114; s++) {
  const list = quranText[String(s)]
  for (let a = 0; a < list.length; a++) {
    // Tanzil's Uthmani text renders waqf/pause signs (small high jeem, sala,
    // etc.) as their own space-delimited tokens even though they are
    // combining marks with no letter of their own. Left in, they'd count as
    // "words" that normalise to the empty string and throw off every word
    // index after them, so they are dropped before indexing begins.
    const words = list[a]
      .trim()
      .split(/\s+/)
      .filter((w) => normalize(w).length > 0)
    ayahs.push({ s, a: a + 1, words, norm: words.map(normalize) })
  }
}

// The basmala opens 113 surahs by design, not by coincidence, so treating it
// as a fork would bury every real one under a hundred-plus copies of noise.
// It is only excluded at exactly its own length — "in the name of Allah, the
// Most Merciful, the..." continuing into something surah-specific is a real
// fork and stays in.
const basmalaWords = ayahs[0].words.slice(0, 4).map(normalize)
const basmalaKey = basmalaWords.join(' ')

// ngramMap groups every (length, normalised text) pair with everywhere it
// occurs. Built with an incrementally-extended string per start position
// rather than re-slicing+joining for every n, since ayahs run long enough
// (2:282 has ~128 words) that the naive quadratic restart would add up.
const ngramMap = new Map()
for (const ay of ayahs) {
  const L = ay.norm.length
  for (let i = 0; i < L; i++) {
    const maxN = L - i
    let acc = ay.norm[i]
    for (let n = 1; n <= maxN; n++) {
      if (n > 1) acc += ' ' + ay.norm[i + n - 1]
      if (n < 4) continue
      if (n === 4 && acc === basmalaKey) continue
      const key = n + ':' + acc
      let arr = ngramMap.get(key)
      if (!arr) ngramMap.set(key, (arr = []))
      arr.push({ ay, i, n })
    }
  }
}

// Second pass: for each start position, walk n from longest possible down to
// 4 and take the first length that is shared with another position at all.
// This is what "maximal match" cashes out to computationally.
const posKey = (ay, i) => ay.s + ':' + ay.a + ':' + i
const chosenByPos = new Map()
for (const ay of ayahs) {
  const L = ay.norm.length
  for (let i = 0; i < L; i++) {
    const maxN = L - i
    if (maxN < 4) continue
    let acc = ay.norm[i]
    const accByN = new Array(maxN + 1)
    accByN[1] = acc
    for (let n = 2; n <= maxN; n++) {
      acc += ' ' + ay.norm[i + n - 1]
      accByN[n] = acc
    }
    for (let n = maxN; n >= 4; n--) {
      if (n === 4 && accByN[4] === basmalaKey) continue
      const key = n + ':' + accByN[n]
      const arr = ngramMap.get(key)
      if (arr && arr.length >= 2) {
        chosenByPos.set(posKey(ay, i), { n, key })
        break
      }
    }
  }
}

// A group is only a real fork if the positions still standing after the
// maximal-match filter (i.e. the ones that don't extend any further) diverge
// in what comes next; two positions that both simply end their ayah there
// are not a fork, they are two ayahs that happen to be the same length.
const forks = []
for (const [key, arr] of ngramMap) {
  if (arr.length < 2) continue
  const n = Number(key.slice(0, key.indexOf(':')))
  const sub = arr.filter((p) => chosenByPos.get(posKey(p.ay, p.i))?.n === n)
  if (sub.length < 2) continue

  // If every position in this group also shares the same word immediately
  // to its left, the group is just this same divergence viewed one word
  // later than necessary: starting one word earlier reproduces the same
  // "at" set (shifted) with the same next-word split, and that earlier,
  // longer start is what gets reported when its own position is processed.
  // Without this check the ablution passage shared by 4:43 and 5:6 (24
  // words identical, then diverging) would otherwise surface as seven
  // separate forks — one per starting offset — for a single drill point.
  const leftExtendable =
    sub.every((p) => p.i > 0) &&
    new Set(sub.map((p) => p.ay.norm[p.i - 1])).size === 1
  if (leftExtendable) continue

  const nextNorm = (p) => {
    const w = p.ay.words[p.i + p.n]
    return w === undefined ? null : normalize(w)
  }
  if (new Set(sub.map(nextNorm)).size < 2) continue

  const positions = sub
    .map((p) => ({
      s: p.ay.s,
      a: p.ay.a,
      w: p.i + 1,
      next: p.ay.words[p.i + p.n] ?? null,
    }))
    .sort((x, y) => x.s - y.s || x.a - y.a || x.w - y.w)

  forks.push({
    n,
    text: sub[0].ay.words.slice(sub[0].i, sub[0].i + n).join(' '),
    at: positions,
  })
}

forks.sort((x, y) => y.n - x.n || x.at[0].s - y.at[0].s || x.at[0].a - y.at[0].a || x.at[0].w - y.at[0].w)

const json = JSON.stringify({
  version: '1',
  note: 'Shared phrases that diverge; the classic hifz wrong-branch error.',
  forks,
})
writeFileSync(outPath, json)

console.log(`wrote ${outPath}`)
console.log(`forks ${forks.length}`)
console.log(`size ${(json.length / 1024).toFixed(1)} KB`)
const longest = forks.reduce((best, f) => (f.n > best.n ? f : best), forks[0])
console.log(`longest n=${longest.n}: ${longest.text}`)
