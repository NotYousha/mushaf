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
import { createHash } from 'node:crypto'
import { readFontFacts } from './lib/woff2.mjs'

const OUT_DIR = 'public/fonts'
const MANIFEST = 'data/fonts.json'

const FONTS = [
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
    'because their licences forbid modification.',
  fonts: entries,
}
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`\nwrote ${MANIFEST} — ${entries.length} font(s)`)
