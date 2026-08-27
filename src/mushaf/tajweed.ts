/**
 * Tajweed colouring, as ranges inside our own words.
 *
 * `public/tajweed.json` holds one entry per coloured word, keyed the same way
 * the page layout keys it:
 *
 *     { "1:1:2": [["h", 0, 1]], "1:1:3": [["h", 0, 1], ["l", 1, 2]] }
 *
 * — a rule, and a character range within that word. The word is still one
 * element on the page; only its insides are cut into coloured runs. That is
 * the whole reason this exists as data rather than as a font or a scan:
 * everything the page can already do keeps working.
 */

/** A rule and where it falls in a word: [rule, start, end). */
export type Span = [string, number, number]
export type Tajweed = Record<string, Span[]>

const BASE = import.meta.env?.BASE_URL ?? '/'
let loading: Promise<Tajweed | null> | null = null

/**
 * Fetched, not bundled — 1.3 MB, and only the reader who chooses the tajweed
 * mushaf should pay it. A failure resolves to null and the page renders
 * uncoloured, because an uncoloured Quran is still the Quran.
 */
export function loadTajweed(): Promise<Tajweed | null> {
  loading ??= fetch(`${BASE}tajweed.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Tajweed>) : null))
    .catch(() => null)
  return loading
}

/**
 * A word cut into runs, each carrying the rule that colours it or none.
 *
 * Overlapping rules are possible in the source — a hamzat wasl inside a madd —
 * and the page can only paint one colour on a letter. The later rule wins,
 * which matches how the printed tajweed mushafs resolve it: the more specific
 * rule is the one marked.
 */
export function runs(text: string, spans: Span[] | undefined): { text: string; rule?: string }[] {
  if (!spans?.length) return [{ text }]

  const at: (string | undefined)[] = new Array(text.length).fill(undefined)
  for (const [rule, start, end] of spans) {
    for (let i = Math.max(0, start); i < Math.min(text.length, end); i++) at[i] = rule
  }

  const out: { text: string; rule?: string }[] = []
  let from = 0
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || at[i] !== at[from]) {
      out.push({ text: text.slice(from, i), rule: at[from] })
      from = i
    }
  }
  return out
}
