/**
 * Makes a timing file agree with the page layout about what a word is.
 *
 * The layout is the authority, because it is what gets highlighted: every
 * `starts[i]` in a timing file is the moment the layout's word `i + 1` begins,
 * and if the two disagree about how many words an ayah has then every word
 * after the disagreement is highlighted at the wrong moment for the rest of
 * that ayah.
 *
 * They disagree in exactly one way. The printed mushaf sets a few compounds as
 * one token with a space inside it — بَعْدَ مَا in 2:181, 8:6 and 13:37, and
 * إِلْ يَاسِينَ in 37:130 — where a word-timing source counts two. Four ayahs
 * in the whole Quran, and the shipped Barhaji file carried 77,433 starts
 * against the layout's 77,429 for precisely that reason.
 *
 * So: a layout token containing a space swallows the extra start, keeping the
 * first — the compound begins when its first half does. Written as a rule
 * rather than as four patches, because the next timing file will have the same
 * four, and because a rule can be checked.
 *
 * usage: align-timings-to-layout.mjs data/timings-<id>.json
 */
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('usage: align-timings-to-layout.mjs <timings.json>')
  process.exit(1)
}

const layout = JSON.parse(readFileSync('data/mushaf-layout.json', 'utf8'))
const timings = JSON.parse(readFileSync(file, 'utf8'))

/** Per ayah, the layout's words in order — the text, so compounds show. */
const wordsOf = new Map()
for (const lines of layout.pages) {
  for (const line of lines) {
    for (const w of line.w) {
      if (!w[1]) continue
      const [s, a] = w[1].split(':')
      const key = `${s}:${a}`
      if (!wordsOf.has(key)) wordsOf.set(key, [])
      wordsOf.get(key).push(w[0])
    }
  }
}

/** An Arabic letter, as opposed to a mark, a digit or a pause symbol. */
const LETTER = /[ؠ-يٮ-ۓ]/

/**
 * How many spoken words a printed token holds.
 *
 * Almost always one. Two where the mushaf sets a compound with a space in it
 * — بَعْدَ مَا, إِلْ يَاسِينَ — which a timing source counts as two words.
 *
 * The space is not enough on its own to tell them apart. A token also carries
 * a space before a waqf mark: يُبَدِّلُونَهُۥٓ ۚ is one word and a pause
 * symbol, and treating it as two swallowed a start that belonged to the next
 * word. So a piece counts only if it contains a letter.
 */
const spokenWords = (token) =>
  Math.max(1, token.trim().split(/\s+/).filter((p) => LETTER.test(p)).length)

let repaired = 0
let stillWrong = 0
let words = 0

for (const [surah, verses] of Object.entries(timings.surahs)) {
  for (const verse of verses) {
    const [ayah, starts] = verse
    const layoutWords = wordsOf.get(`${surah}:${ayah}`)
    if (!layoutWords) {
      console.error(`${surah}:${ayah} is not in the layout`)
      process.exit(1)
    }
    if (starts.length !== layoutWords.length) {
      const out = []
      let src = 0
      for (const word of layoutWords) {
        // The compound begins when its first half does, so the extra start
        // is dropped rather than averaged in.
        out.push(starts[src])
        src += spokenWords(word)
      }
      if (out.length === layoutWords.length && out.every((n) => typeof n === 'number')) {
        verse[1] = out
        repaired++
        console.log(
          `  ${surah}:${ayah} — ${starts.length} starts to ${out.length}, ` +
            `merging ${layoutWords.filter((w) => spokenWords(w) > 1).join(' / ')}`,
        )
      } else {
        stillWrong++
        console.error(
          `  ${surah}:${ayah} — ${starts.length} starts, ${layoutWords.length} words, ` +
            `and the spaced-token rule does not explain it`,
        )
      }
    }
    words += verse[1].length
  }
}

if (stillWrong) {
  console.error(`\n${stillWrong} ayahs unexplained — nothing written`)
  process.exit(1)
}

writeFileSync(file, JSON.stringify(timings))
console.log(`\n${file}: ${repaired} ayahs realigned, ${words} word starts`)
