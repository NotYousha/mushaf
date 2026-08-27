/**
 * Fetches the mushaf faces this app self-hosts, and records what they are.
 *
 *   node scripts/fetch-mushaf-fonts.mjs
 *
 * Separate from build-fonts.mjs, which pulls the interface faces from Google
 * and subsets them. Nothing here is subsetted. These fonts are licensed to be
 * copied and distributed but *not* modified, and subsetting a font is
 * modifying it — dropping the tables and glyphs you happen not to need is
 * still altering the font software. So the bytes served are the bytes
 * received, and the check below exists to prove it.
 *
 * What each font is allowed to be used for is not paraphrased anywhere. The
 * licence written into the font's own name table is copied into
 * data/fonts.json verbatim, so NOTICES.md can quote it and nobody has to
 * re-fetch a font to find out what it permits.
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFontFacts } from './lib/woff2.mjs'

const OUT_DIR = 'public/fonts'
const MANIFEST = 'data/fonts.json'

const FONTS = [
  {
    id: 'kfgqpc-hafs-uthmanic',
    file: 'kfgqpc-hafs-uthmanic.woff2',
    /*
     * The face the Uthmani mushaf was actually drawn in.
     *
     * data/mushaf-layout.json is the King Fahd Complex's own 604-page Madani
     * mushaf — their line breaks, page for page. We were setting them in
     * Amiri Quran, which is a fine face and the wrong one: it is not what
     * those breaks were computed against, and it draws the Uthmani marks
     * differently. This is the Complex's own Hafs face, v2.2.
     *
     * Served as WOFF2 by the same CDN that serves the TTF, which settles a
     * question the licence would otherwise raise. KFGQPC permit copying and
     * distribution and forbid modification, and converting a TTF ourselves —
     * even though WOFF2 is a container transform that leaves every outline
     * untouched — would put us in the position of arguing about it. We do not
     * have to: the WOFF2 here decompiles to the same 1572 glyphs, the same
     * outlines, the same hmtx and the same cmap as the TTF beside it, so it
     * is the same font software, and we did not transform anything.
     */
    source: 'https://static-cdn.tarteel.ai/qul/fonts/UthmanicHafs_V22.woff2',
    usedBy: ['uthmani'],
    // Every codepoint of this layout must be in the font's cmap, or a word
    // renders with a tofu box in the middle of an ayah.
    coverageLayout: 'data/mushaf-layout.json',
    // Measured against the face it replaces. See measure-mushaf-face.py.
    compareTo: `${OUT_DIR}/amiri-quran-400-arabic.woff2`,
  },
  {
    id: 'kfgqpc-nastaleeq',
    file: 'kfgqpc-nastaleeq.woff2',
    /*
     * The IndoPak face this app is actually allowed to host.
     *
     * The face that renders quran.com's IndoPak layout perfectly is
     * QuranWBW's AlQuran IndoPak, and its embedded licence forbids
     * distribution without written permission, so it cannot be shipped. This
     * one can: its name table grants the right to Use, Copy and Distribute
     * free of cost, and forbids selling and modifying. Hosting an unaltered
     * copy is squarely inside that.
     *
     * It does not cover ten of the codepoints quran.com's IndoPak text uses —
     * nine private-use marks and one Arabic presentation form. Those are
     * stripped in build-alt-layouts.mjs, which then proves every remaining
     * codepoint against this font's cmap.
     */
    source:
      'https://static-cdn.tarteel.ai/qul/fonts/nastaleeq/KFGQPCNastaleeq-Regular.woff2',
    usedBy: ['indopak-15'],
  },
]

mkdirSync(OUT_DIR, { recursive: true })

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

const hex = (cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0')

/**
 * Every codepoint a layout writes, checked against what the font can draw.
 *
 * A codepoint the font has no glyph for is a tofu box in the middle of an
 * ayah, so this reports the fraction covered and names every miss. It does
 * not throw: a face can be worth recording, and worth deciding about, while
 * still being short a codepoint or two — but the shortfall has to be written
 * down rather than discovered on the page.
 *
 * Two classes are exempt, and by Unicode property rather than by name.
 * Default_Ignorable_Code_Point means "drop me if you have no glyph", so its
 * absence from a cmap is correct behaviour and not a gap; White_Space is laid
 * out by the shaper, which needs no glyph either. Naming the individual
 * characters instead would quietly exempt the next one that turns up.
 */
function checkCoverage(layoutPath, cmap) {
  const layout = JSON.parse(readFileSync(layoutPath, 'utf8'))
  const tokens = new Map() // codepoint -> how many tokens contain it
  for (const page of layout.pages)
    for (const line of page)
      for (const word of line.w) {
        for (const cp of new Set([...word[0]].map((c) => c.codePointAt(0))))
          tokens.set(cp, (tokens.get(cp) ?? 0) + 1)
      }

  const nonRendering = (cp) => {
    const ch = String.fromCodePoint(cp)
    return /\p{White_Space}/u.test(ch) || /\p{Default_Ignorable_Code_Point}/u.test(ch)
  }
  const required = [...tokens.keys()].filter((cp) => !nonRendering(cp)).sort((a, b) => a - b)
  const missing = required.filter((cp) => !cmap.has(cp))

  console.log(
    `  coverage of ${layoutPath}: ${required.length - missing.length}/${required.length}` +
      ` codepoints`,
  )
  for (const cp of missing)
    console.log(`    MISSING ${hex(cp)} — in ${tokens.get(cp)} token(s)`)

  return {
    layout: layoutPath,
    required: required.length,
    covered: required.length - missing.length,
    exempt: [...tokens.keys()].filter(nonRendering).sort((a, b) => a - b).map(hex),
    missing: missing.map((cp) => ({ codepoint: hex(cp), tokens: tokens.get(cp) })),
  }
}

/**
 * Hand the face to measure-mushaf-face.py and keep what it says.
 *
 * Shaped advance widths need a shaper, and a real one: Arabic width depends
 * on positional forms and mark attachment, so summing nominal advances out of
 * hmtx would answer a question nobody asked. HarfBuzz lives in Python here.
 *
 * Missing Python is not a reason to fail the fetch — the font is still
 * fetched, verified and recorded — but it is a reason to say so loudly, since
 * a null here silently drops the comparison this face was adopted for.
 */
function measure(facePath, referencePath) {
  try {
    const out = execFileSync(
      'python',
      ['scripts/measure-mushaf-face.py', facePath, referencePath, 'data/mushaf-layout.json'],
      { encoding: 'utf8', maxBuffer: 32 << 20, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
    )
    const m = JSON.parse(out)
    console.log(
      `  vs ${m.reference.family}: width x${m.widthRatio.mean} at equal nominal size, ` +
        `x${m.widthRatioAtEqualVerticalInk} at equal vertical ink`,
    )
    console.log(
      `  stretch the renderer would ask for: ${m.stretchNeeded.face.mean} mean ` +
        `(reference ${m.stretchNeeded.reference.mean})`,
    )
    return m
  } catch (err) {
    console.warn(
      `  WARNING: could not measure against ${referencePath} — ` +
        `${err.message.split('\n')[0]}\n` +
        `  (needs python with fontTools and uharfbuzz; the font is still recorded)`,
    )
    return null
  }
}

const entries = []
for (const font of FONTS) {
  console.log(`\n${font.id}`)
  console.log(`  GET ${font.source}`)

  const res = await fetch(font.source, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`${font.id}: HTTP ${res.status}`)
  const served = Buffer.from(await res.arrayBuffer())
  const servedHash = sha256(served)

  const declared = res.headers.get('content-length')
  if (declared && Number(declared) !== served.length)
    throw new Error(
      `${font.id}: Content-Length ${declared} but ${served.length} bytes arrived`,
    )

  /*
   * A second fetch, compared byte for byte against the first. A truncated
   * response that still parses is the failure this is here to catch: it would
   * otherwise be written out, hashed, and recorded as authentic.
   */
  const again = Buffer.from(
    await (
      await fetch(font.source, { signal: AbortSignal.timeout(120_000) })
    ).arrayBuffer(),
  )
  if (sha256(again) !== servedHash)
    throw new Error(`${font.id}: two fetches returned different bytes`)

  const path = `${OUT_DIR}/${font.file}`
  writeFileSync(path, served)

  // Read back from disk rather than trusting the write.
  const onDisk = readFileSync(path)
  if (sha256(onDisk) !== servedHash)
    throw new Error(`${font.id}: bytes on disk differ from bytes served`)
  console.log(`  ${served.length} bytes, sha256 ${servedHash}`)
  console.log(`  verbatim: served == on disk == refetch`)

  const { cmap, names } = readFontFacts(onDisk)
  const licence = names.get(13)
  if (!licence)
    throw new Error(
      `${font.id}: no licence (nameID 13) in the font — refusing to record ` +
        `a font whose terms cannot be quoted`,
    )
  console.log(`  family "${names.get(1)}", ${cmap.size} codepoints in cmap`)

  const coverage = font.coverageLayout
    ? checkCoverage(font.coverageLayout, cmap)
    : null
  const measured = font.compareTo ? measure(path, font.compareTo) : null

  entries.push({
    id: font.id,
    file: `${OUT_DIR}/${font.file}`,
    source: font.source,
    bytes: served.length,
    sha256: servedHash,
    subsetted: false,
    family: names.get(1) ?? null,
    fontVersion: names.get(5) ?? null,
    cmapCodepoints: cmap.size,
    usedBy: font.usedBy,
    ...(coverage ? { coverage } : {}),
    ...(measured ? { measured } : {}),
    // Verbatim from the font's own name table. Not paraphrased, not summarised.
    copyright: names.get(0) ?? null,
    licence,
    licenceUrl: names.get(14) ?? null,
  })
}

const manifest = {
  note:
    'Written by scripts/fetch-mushaf-fonts.mjs. Every licence field is copied ' +
    'verbatim from the font name table (nameID 0, 13, 14) — do not edit or ' +
    'paraphrase them. These fonts are hosted unmodified and unsubsetted ' +
    'because their licences forbid modification. `coverage` is checked ' +
    'against the layout the face renders; `measured` comes from ' +
    'scripts/measure-mushaf-face.py, which shapes real lines with HarfBuzz.',
  fonts: entries,
}
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`\nwrote ${MANIFEST} — ${entries.length} font(s)`)
