/**
 * Builds the alternative mushaf page layouts — data/layout-<id>.json.
 *
 * Same shape as data/mushaf-layout.json, which build-mushaf-layout.mjs writes
 * for the 1405 Madani edition:
 *
 *   { version, pageCount, linesPerPage, words, ayahs,
 *     pages: [ [ { n: <line>, w: [ ["<text>","<surah:ayah:word>"], ["<end>"] ] } ] ] }
 *
 * A 2-tuple is a word: its text and the key audio timings address it by.
 * A 1-tuple is an ayah-end marker, which carries no timing and so no key.
 *
 * `pages` stays the array the app already reads. `pageCount` and the other
 * scalars are the count checks — written into the file so a truncated or
 * half-fetched build is visible without re-deriving it.
 *
 * Source is quran.com's own CDN API, which serves every registered mushaf
 * layout off one endpoint keyed by `mushaf`:
 *
 *   https://api.qurancdn.com/api/qdc/verses/by_page/{page}?mushaf={id}&words=true&per_page=all
 *
 * Build all three, or name the ones you want:
 *
 *   node scripts/build-alt-layouts.mjs
 *   node scripts/build-alt-layouts.mjs indopak-15
 *
 * The three differ in far more than line count, and the differences are the
 * whole difficulty:
 *
 * - **indopak-15** is the one that ships. It is built from `text_indopak`
 *   rather than `text`, because `text` can only be drawn by a font this app
 *   is not licensed to distribute; see the note on that layout below. Ten
 *   codepoints its licensed font cannot draw are stripped, and the build then
 *   proves every remaining codepoint against that font's own cmap.
 * - **indopak-16** and **qpc-v2-1421** are built from `text`, and neither has
 *   a font settled yet. qpc-v2's `text` is not text at all but pre-shaped V2
 *   glyph codepoints, needing one font per page; its `version` string says so,
 *   because nothing else in the file would.
 *
 * Whatever the source field, the word keys must come out identical to the
 * 1405 Madani layout's — the app addresses audio timings, tajweed and the
 * Veil by `surah:ayah:word`, so an edition that segments words differently
 * would mis-address every one of them rather than fail visibly. That is
 * checked, not assumed.
 */
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { readFontFacts } from './lib/woff2.mjs'

// Versioned, because what gets kept per word has changed once already and a
// stale entry is indistinguishable from a fresh one.
const CACHE = '.cache/alt-pages/v2'
const CONCURRENCY = 6
const RETRIES = 3

const LAYOUTS = [
  {
    id: 'indopak-15',
    mushaf: 6,
    pages: 610,
    lines: 15,
    version: 'indopak-15-lines-unicode-610-pages-for-kfgqpc-nastaleeq',
    /*
     * `text_indopak`, not `text`.
     *
     * The endpoint returns both. `text` is what the printed IndoPak mushaf
     * looks like, and only QuranWBW's AlQuran IndoPak draws it — 27 of its 98
     * word codepoints are private-use, tied to that one face, whose licence
     * forbids distributing it. That is a page this app is not allowed to
     * serve.
     *
     * `text_indopak` is very nearly plain Unicode: ayah numbers come through
     * as ordinary Arabic-Indic digits rather than private-use glyphs, and only
     * nine private-use codepoints remain in the words. Strip those ten and the
     * text is renderable by KFGQPC Nastaleeq, which *is* licensed to be copied
     * and distributed. An IndoPak page that can ship beats a better-looking
     * one that cannot.
     */
    textField: 'text_indopak',
    font: 'public/fonts/kfgqpc-nastaleeq.woff2',
    /*
     * The only codepoints removed, and the entire reason for the list: every
     * one of them is absent from that font's cmap, and absent from a cmap
     * means a tofu box mid-ayah. They are typographic refinements — small
     * high letters and spacing marks quran.com carries in the private-use
     * area — not letters, so removing them costs a mark and never a sound.
     *
     * Nothing else is stripped. If a codepoint outside this list turns out to
     * be uncovered, the coverage check below fails the build rather than the
     * list quietly growing to absorb it.
     */
    strip: [
      0xe003, 0xe004, 0xe01a, 0xe01b, 0xe01c, 0xe01e, 0xe01f, 0xe021, 0xe022,
      0xfe8e,
    ],
    /** A jump past this means upstream changed, not that more marks appeared. */
    maxStrippedShare: 0.03,
  },
  {
    id: 'qpc-v2-1421',
    mushaf: 1,
    pages: 604,
    lines: 15,
    // Says "glyphs" in the name because the `text` in this file is V2 glyph
    // codepoints in the Arabic Presentation Forms blocks, not readable text.
    version: 'qpc-v2-1421-15-lines-glyph-codepoints-not-text-604-pages',
    textField: 'text',
  },
  {
    id: 'indopak-16',
    mushaf: 7,
    pages: 548,
    lines: 16,
    version: 'indopak-16-lines-unicode-548-pages',
    textField: 'text',
  },
]

/**
 * Which layouts to build. With no arguments, all of them.
 *
 * Named on the command line, only those — so a shipped file can be left
 * alone while another is reworked, rather than every layout being rewritten
 * because one of them changed.
 */
const only = process.argv.slice(2)
const SELECTED = only.length
  ? LAYOUTS.filter((l) => only.includes(l.id))
  : LAYOUTS
for (const id of only)
  if (!LAYOUTS.some((l) => l.id === id))
    throw new Error(`unknown layout "${id}"`)

const SURAH_AYAHS = new Map(
  JSON.parse(readFileSync('data/surahs.json', 'utf8')).map((s) => [
    s.surah,
    s.ayahs,
  ]),
)
const TOTAL_AYAHS = [...SURAH_AYAHS.values()].reduce((a, b) => a + b, 0)

/** Per-ayah word counts from the Madani layout, to cross-check every edition. */
const BASELINE = (() => {
  const counts = new Map()
  const madani = JSON.parse(readFileSync('data/mushaf-layout.json', 'utf8'))
  for (const line of madani.pages.flat())
    for (const w of line.w) {
      if (w.length !== 2) continue
      const ayah = w[1].slice(0, w[1].lastIndexOf(':'))
      counts.set(ayah, (counts.get(ayah) || 0) + 1)
    }
  return counts
})()

async function fetchPage(mushaf, n, field) {
  // Keyed by the text field too: a page cached from `text` holds nothing
  // usable for a build that wants `text_indopak`, and the two are otherwise
  // indistinguishable on disk.
  const dir = `${CACHE}/${mushaf}-${field}`
  const f = `${dir}/${n}.json`
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'))
  mkdirSync(dir, { recursive: true })
  const url =
    `https://api.qurancdn.com/api/qdc/verses/by_page/${n}` +
    `?mushaf=${mushaf}&words=true&per_page=all` +
    (field === 'text' ? '' : `&word_fields=${field}`)
  let last
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!Array.isArray(json.verses) || !json.verses.length)
        throw new Error('no verses in response')
      // Cache only what the layout needs. The endpoint also returns a
      // translation and transliteration per word, which triple the payload
      // and are of no use here.
      const slim = json.verses.map((v) => ({
        k: v.verse_key,
        w: (v.words || []).map((w) => {
          const t = w[field]
          if (typeof t !== 'string')
            throw new Error(`word ${v.verse_key}:${w.position} has no ${field}`)
          return {
            p: w.position,
            l: w.line_number,
            t,
            c: w.char_type_name,
            // Kept because it is not always the page that was asked for — see
            // the filter in build().
            g: w.page_number,
          }
        }),
      }))
      writeFileSync(f, JSON.stringify(slim))
      return slim
    } catch (e) {
      last = e
      if (attempt < RETRIES)
        await new Promise((r) => setTimeout(r, 500 * attempt))
    }
  }
  throw new Error(`mushaf ${mushaf} page ${n}: ${last.message}`)
}

async function build(spec) {
  console.log(`\n${spec.id} — mushaf ${spec.mushaf}, ${spec.pages} pages`)

  const pages = new Array(spec.pages + 1)
  const queue = Array.from({ length: spec.pages }, (_, i) => i + 1)
  const failures = []
  let done = 0

  // Verses whose ayah-end marker arrived mis-typed upstream — see below.
  const repaired = new Set()

  /*
   * Codepoints the shipped font cannot draw, removed on the way through, and
   * the accounting that keeps that honest: how many words were touched, and
   * twenty of them before and after so the damage can be read rather than
   * taken on trust.
   */
  const strip = new Set(spec.strip ?? [])
  const stripSamples = []
  let wordsSeen = 0
  let wordsStripped = 0
  const emptied = []

  const clean = (text, key) => {
    if (!strip.size) return text
    wordsSeen++
    let out = ''
    let hit = false
    for (const ch of text) {
      if (strip.has(ch.codePointAt(0))) {
        hit = true
        continue
      }
      out += ch
    }
    if (!hit) return text
    wordsStripped++
    if (stripSamples.length < 20) {
      // The removed codepoints are invisible — private-use marks and a
      // presentation form — so printing the two strings side by side shows
      // two identical-looking words and proves nothing. What is actually
      // inspectable is which codepoints went, and that the letters did not.
      const removed = [...text]
        .filter((ch) => strip.has(ch.codePointAt(0)))
        .map((ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
      stripSamples.push({
        key,
        before: text,
        after: out,
        removed,
        lengths: `${[...text].length}->${[...out].length}`,
      })
    }
    // A word that is nothing but strippable marks would vanish from the page
    // and take its timing key with it. None exist today; if one appears the
    // build should stop rather than drop a word.
    if (!out.length) emptied.push(key)
    return out
  }

  const worker = async () => {
    for (;;) {
      const n = queue.shift()
      if (!n) return
      try {
        const verses = await fetchPage(spec.mushaf, n, spec.textField)
        const lines = new Map()
        for (const v of verses) {
          /*
           * Mushaf 7 returns a verse that straddles a page break in full on
           * both of its pages, so without this filter every straddling verse
           * is counted twice and every one of its word positions appears
           * twice. Mushafs 1 and 6 filter server-side and this is a no-op for
           * them; it is applied to all three because the difference is not
           * documented anywhere and may not be stable.
           */
          const words = v.w.filter((w) => w.g === n)

          /*
           * One verse — 2:181, in all three mushafs — has its ayah-end marker
           * tagged `char_type_name: "word"` upstream. Left alone it gives the
           * verse one word too many, a word key pointing at a number glyph
           * rather than a word, and 6235 markers instead of 6236.
           *
           * It really is the marker: in mushaf 6 the glyph is
           * U+06DF U+0615 U+F5B4, exactly one private-use codepoint on from
           * 2:180's U+06DF U+0615 U+F5B3, which is the sequence those
           * ayah-number glyphs run in.
           *
           * The repair is by shape, not by hardcoded verse key: a verse with
           * no marker at all ends with one. Every repair is reported, and the
           * count is checked, so this quietly growing is not something the
           * build can do.
           */
          const lastPos = v.w.reduce((a, w) => Math.max(a, w.p), 0)
          const headless = !v.w.some((w) => w.c === 'end')

          for (const w of words) {
            const end = w.c === 'end' || (headless && w.p === lastPos)
            if (end && w.c !== 'end') repaired.add(v.k)
            if (!lines.has(w.l)) lines.set(w.l, [])
            const key = `${v.k}:${w.p}`
            // Markers are ayah numbers, already plain digits in this field,
            // and are left exactly as they came.
            lines.get(w.l).push({ t: end ? w.t : clean(w.t, key), end, k: key })
          }
        }
        pages[n] = [...lines.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([line, ws]) => ({
            n: line,
            w: ws.map((g) => (g.end ? [g.t] : [g.t, g.k])),
          }))
      } catch (e) {
        failures.push({ n, error: e.message })
      }
      if (++done % 100 === 0) console.log(`  ${done}/${spec.pages} …`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  if (failures.length) {
    console.error(`  ${failures.length} pages failed to fetch:`)
    for (const f of failures.slice(0, 10))
      console.error(`    page ${f.n}: ${f.error}`)
    throw new Error(`${spec.id}: ${failures.length} pages failed`)
  }

  const out = pages.slice(1)
  const stripStats = { wordsSeen, wordsStripped, stripSamples, emptied }
  return {
    spec,
    pages: out,
    repaired,
    stripStats,
    ...validate(spec, out, repaired, stripStats),
  }
}

/**
 * Everything that could be wrong with a layout and would not be obvious from
 * looking at one. Collects rather than throws, so one run reports all of it.
 */
function validate(spec, pages, repaired, stripStats) {
  const errors = []
  const notes = []

  // — line numbers —
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]
    const num = i + 1
    if (!p || !p.length) {
      errors.push(`page ${num} is empty`)
      continue
    }
    const seen = new Set()
    for (const line of p) {
      if (!Number.isInteger(line.n) || line.n < 1 || line.n > spec.lines)
        errors.push(
          `page ${num} has line number ${line.n}, outside 1–${spec.lines}`,
        )
      if (seen.has(line.n)) errors.push(`page ${num} repeats line ${line.n}`)
      seen.add(line.n)
      if (!line.w.length) errors.push(`page ${num} line ${line.n} is empty`)
    }
  }

  /*
   * — lines per page —
   *
   * A page is not required to have all 15 (or 16) lines of words, and most
   * short pages are not a fault. A surah heading takes a line and its basmala
   * takes another, and neither carries words, so the API returns nothing for
   * them: the 1405 Madani layout this app already ships has 116 pages of
   * fewer than 15 lines for exactly that reason.
   *
   * So the check is not "is it 15" but "is every missing line paid for by
   * surah furniture". A surah costs one line for its heading plus one for its
   * basmala — except Al-Fatiha, whose basmala is ayah 1:1 and so is a line of
   * words, and At-Tawbah, which has no basmala. A heading is sometimes set at
   * the foot of the preceding page, so each page may also spend the next
   * page's furniture. Pages 1 and 2 are ornamental frames and are exempt.
   *
   * Blank lines at the *foot* of a page are exempt too, and are counted
   * rather than charged. A mushaf does not stretch its text to fill the last
   * page of a surah run: the 610-page IndoPak leaves 16 such lines across the
   * whole edition, the 604-page Madani leaves 35. Only a gap at or above the
   * last line of words is evidence of a line that went missing.
   *
   * Run against data/mushaf-layout.json this rule produces zero violations
   * across all 604 pages, which is why it is trusted to fail the build here.
   */
  const startPage = new Map()
  pages.forEach((page, i) => {
    for (const line of page)
      for (const w of line.w) {
        if (w.length !== 2) continue
        const [surah, ayah] = w[1].split(':').map(Number)
        if (ayah === 1 && !startPage.has(surah)) startPage.set(surah, i + 1)
      }
  })
  if (startPage.size !== 114)
    errors.push(`${startPage.size} surah openings found, not 114`)

  const furniture = new Array(pages.length + 2).fill(0)
  for (const [surah, p] of startPage)
    furniture[p] += 1 + (surah === 1 || surah === 9 ? 0 : 1)

  const unpaid = []
  let shortPages = 0
  let trailing = 0
  pages.forEach((page, i) => {
    const num = i + 1
    const present = new Set(page.map((l) => l.n))
    const last = Math.max(...present)
    const gaps = []
    for (let l = 1; l <= last; l++) if (!present.has(l)) gaps.push(l)
    trailing += spec.lines - last
    if (page.length < spec.lines) shortPages++
    const budget =
      furniture[num] + (furniture[num + 1] || 0) + (num <= 2 ? spec.lines : 0)
    if (gaps.length > budget)
      unpaid.push(
        `page ${num}: lines ${gaps.join(', ')} absent, ${budget} explained`,
      )
  })
  if (unpaid.length)
    errors.push(
      `${unpaid.length} page(s) missing more lines than surah headings and ` +
        `basmalas account for: ${unpaid.slice(0, 10).join('; ')}`,
    )
  if (shortPages)
    notes.push(
      `${shortPages} of ${pages.length} pages carry fewer than ${spec.lines} ` +
        `lines of words — surah headings and basmalas, plus ${trailing} blank ` +
        `line(s) at the foot of a page across the whole edition`,
    )

  // — keys —
  const ayahWords = new Map()
  let words = 0
  let markers = 0
  const badKeys = new Set()
  for (const page of pages)
    for (const line of page)
      for (const w of line.w) {
        if (w.length === 1) {
          markers++
          continue
        }
        words++
        const m = /^(\d+):(\d+):(\d+)$/.exec(w[1])
        if (!m) {
          badKeys.add(w[1])
          continue
        }
        const [surah, ayah, pos] = m.slice(1).map(Number)
        const count = SURAH_AYAHS.get(surah)
        if (!count) badKeys.add(`${w[1]} (surah ${surah} out of 1–114)`)
        else if (ayah < 1 || ayah > count)
          badKeys.add(`${w[1]} (surah ${surah} has ${count} ayahs)`)
        else {
          const key = `${surah}:${ayah}`
          if (!ayahWords.has(key)) ayahWords.set(key, [])
          ayahWords.get(key).push(pos)
        }
      }
  if (badKeys.size)
    errors.push(
      `${badKeys.size} malformed word key(s): ` +
        `${[...badKeys].slice(0, 10).join(', ')}`,
    )

  // — every ayah once, whole, and the same length as the Madani edition —
  const missing = []
  for (const [surah, count] of SURAH_AYAHS)
    for (let a = 1; a <= count; a++)
      if (!ayahWords.has(`${surah}:${a}`)) missing.push(`${surah}:${a}`)
  if (missing.length)
    errors.push(
      `${missing.length} ayah(s) missing of ${TOTAL_AYAHS}: ` +
        `${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ' …' : ''}`,
    )
  if (ayahWords.size !== TOTAL_AYAHS - missing.length)
    errors.push(`ayah bookkeeping mismatch (${ayahWords.size})`)

  const ragged = []
  const drift = []
  for (const [ayah, positions] of ayahWords) {
    const sorted = [...positions].sort((a, b) => a - b)
    const whole = sorted.every((p, i) => p === i + 1)
    if (!whole) ragged.push(`${ayah} (positions ${sorted.join(',')})`)
    const base = BASELINE.get(ayah)
    if (base !== undefined && base !== positions.length)
      drift.push(`${ayah}: ${positions.length} vs Madani ${base}`)
  }
  if (ragged.length)
    errors.push(
      `${ragged.length} ayah(s) with gapped or duplicated word positions: ` +
        `${ragged.slice(0, 5).join('; ')}`,
    )
  if (drift.length)
    errors.push(
      `${drift.length} ayah(s) whose word count differs from the Madani ` +
        `layout: ${drift.slice(0, 10).join('; ')}`,
    )

  /*
   * The word keys are the app's addressing scheme: audio timings, the tajweed
   * overlay and the Veil all look words up by `surah:ayah:word`. An edition
   * that segments words even slightly differently would not render wrong — it
   * would silently mis-address every one of them. So the key set is required
   * to be identical to the shipped Madani layout's, not merely well-formed.
   */
  if (BASELINE.size) {
    const baselineKeys = new Set()
    for (const [ayah, count] of BASELINE)
      for (let p = 1; p <= count; p++) baselineKeys.add(`${ayah}:${p}`)
    const mine = new Set()
    for (const page of pages)
      for (const line of page)
        for (const w of line.w) if (w.length === 2) mine.add(w[1])
    const missingKeys = [...baselineKeys].filter((k) => !mine.has(k))
    const extraKeys = [...mine].filter((k) => !baselineKeys.has(k))
    if (missingKeys.length || extraKeys.length)
      errors.push(
        `word keys do not match the Madani layout — ${missingKeys.length} ` +
          `missing, ${extraKeys.length} extra ` +
          `(${[...missingKeys.slice(0, 5), ...extraKeys.slice(0, 5)].join(', ')})` +
          ` — every timing and tajweed lookup addresses words by this key`,
      )
    else notes.push(`all ${mine.size} word keys identical to the Madani layout's`)
  }

  if (markers !== TOTAL_AYAHS)
    errors.push(`${markers} ayah-end markers, expected ${TOTAL_AYAHS}`)

  // The upstream mis-typing is repaired above, but it is repaired blind, so
  // the scale of it is checked here. One verse is the known state of the
  // data; a jump would mean the shape of the feed has changed.
  if (repaired.size)
    notes.push(
      `${repaired.size} verse(s) had a mis-typed ayah-end marker repaired: ` +
        `${[...repaired].join(', ')}`,
    )
  if (repaired.size > 5)
    errors.push(
      `${repaired.size} verses needed an end-marker repair — too many to ` +
        `treat as the known upstream defect; check the feed before trusting this`,
    )

  /*
   * — the stripping, and whether the font can draw what is left —
   *
   * This is the check the whole `text_indopak` exercise exists to pass. A
   * codepoint the font has no glyph for renders as a tofu box in the middle
   * of an ayah, and there is no partial credit: one uncovered letter and the
   * edition is not shippable.
   */
  if (spec.strip) {
    const { wordsSeen, wordsStripped, emptied } = stripStats
    const share = wordsSeen ? wordsStripped / wordsSeen : 0
    notes.push(
      `stripped ${spec.strip.length} uncoverable codepoint(s) from ` +
        `${wordsStripped} of ${wordsSeen} words ` +
        `(${(share * 100).toFixed(2)}%)`,
    )
    if (share > spec.maxStrippedShare)
      errors.push(
        `stripping touched ${(share * 100).toFixed(2)}% of words, over the ` +
          `${(spec.maxStrippedShare * 100).toFixed(0)}% ceiling — upstream has ` +
          `changed and this is no longer removing only decorative marks`,
      )
    if (emptied.length)
      errors.push(
        `${emptied.length} word(s) were emptied by stripping: ` +
          `${emptied.slice(0, 10).join(', ')}`,
      )
  }

  if (spec.font) {
    if (!existsSync(spec.font))
      errors.push(
        `${spec.font} is missing — run scripts/fetch-mushaf-fonts.mjs before ` +
          `building this layout; its coverage cannot be checked without it`,
      )
    else {
      const { cmap } = readFontFacts(readFileSync(spec.font))
      const used = new Map()
      for (const page of pages)
        for (const line of page)
          for (const w of line.w)
            for (const ch of w[0]) {
              const c = ch.codePointAt(0)
              used.set(c, (used.get(c) || 0) + 1)
            }

      /*
       * Whitespace and default-ignorable characters are exempt, and only
       * those. A shaper never draws them: ZWSP and the byte-order mark are
       * Default_Ignorable_Code_Point, which means "delete me if you have no
       * glyph", and the en and em spaces are White_Space, which falls back to
       * a blank advance. Neither can produce a tofu box.
       *
       * The exemption is decided by Unicode property rather than by a list,
       * so a letter can never end up in it — every Arabic letter, every
       * private-use mark and every presentation form fails both tests.
       */
      const exempt = (c) => {
        const ch = String.fromCodePoint(c)
        return /\p{White_Space}/u.test(ch) || /\p{Default_Ignorable_Code_Point}/u.test(ch)
      }

      const uncovered = [...used.keys()].filter((c) => !cmap.has(c))
      const tofu = uncovered.filter((c) => !exempt(c))
      const ignorable = uncovered.filter(exempt)
      const rendering = [...used.keys()].filter((c) => !exempt(c))
      const coveredRendering = rendering.filter((c) => cmap.has(c)).length

      notes.push(
        `font ${spec.font}: ${coveredRendering}/${rendering.length} rendering ` +
          `codepoints in cmap ` +
          `(${((coveredRendering / rendering.length) * 100).toFixed(2)}%)`,
      )
      if (ignorable.length)
        notes.push(
          `${ignorable.length} non-rendering codepoint(s) outside the cmap, ` +
            `exempt as whitespace or default-ignorable: ` +
            ignorable
              .sort((a, b) => a - b)
              .map((c) => `U+${c.toString(16).toUpperCase().padStart(4, '0')} x${used.get(c)}`)
              .join(', '),
        )
      if (tofu.length)
        errors.push(
          `${tofu.length} codepoint(s) in the layout have no glyph in ` +
            `${spec.font} and would render as tofu: ` +
            tofu
              .sort((a, b) => a - b)
              .map((c) => `U+${c.toString(16).toUpperCase().padStart(4, '0')} x${used.get(c)}`)
              .join(', '),
        )
    }
  }

  return { errors, notes, words, markers, ayahs: ayahWords.size }
}

const built = []
for (const spec of SELECTED) built.push(await build(spec))

let failed = false
for (const b of built) {
  console.log(`\n${b.spec.id}`)
  for (const n of b.notes) console.log(`  note: ${n}`)
  // Printed before the verdict, so a build about to fail on the share ceiling
  // still shows what it was removing.
  if (b.stripStats.stripSamples.length) {
    console.log(
      `  stripped words, first ${b.stripStats.stripSamples.length} of ` +
        `${b.stripStats.wordsStripped}:`,
    )
    for (const s of b.stripStats.stripSamples)
      console.log(
        `    ${s.key.padEnd(10)} ${s.lengths.padEnd(8)} ` +
          `removed ${s.removed.join(' ').padEnd(14)} ` +
          `${JSON.stringify(s.after)}`,
      )
  }
  for (const e of b.errors) console.error(`  ERROR: ${e}`)
  if (b.errors.length) {
    failed = true
    continue
  }
  const out = {
    version: b.spec.version,
    pageCount: b.pages.length,
    linesPerPage: b.spec.lines,
    words: b.words,
    ayahs: b.ayahs,
    pages: b.pages,
  }
  if (out.pageCount !== b.spec.pages) {
    console.error(
      `  ERROR: wrote ${out.pageCount} pages, expected ${b.spec.pages}`,
    )
    failed = true
    continue
  }
  const file = `data/layout-${b.spec.id}.json`
  writeFileSync(file, JSON.stringify(out))
  console.log(
    `  wrote ${file} — ${out.pageCount} pages, ${out.words} words, ` +
      `${b.markers} ayah markers, ${out.ayahs} ayahs`,
  )
}

if (failed) {
  console.error('\nOne or more layouts failed validation; bad files not written.')
  process.exit(1)
}
