/**
 * Just enough WOFF2 to read a font's cmap and name table.
 *
 * The layout build has to prove that every codepoint it writes is one the
 * shipped font can draw. Doing that against a *description* of the font — a
 * recorded list of codepoints, say — proves nothing once the file changes
 * under it. So it is done against the bytes in public/fonts, which are WOFF2,
 * and reading those needs this.
 *
 * WOFF2 is a table directory followed by one brotli stream holding every
 * table's data end to end. Only glyf, loca and hmtx are ever stored
 * transformed, and cmap and name never are, so those two come out of the
 * stream verbatim once the offsets are counted correctly. Nothing here
 * reconstructs outlines; this is a reader, not a decoder.
 *
 * Verified against fontTools on the fonts this repo actually ships — same
 * codepoint set, same name records.
 */
import { brotliDecompressSync } from 'node:zlib'

/** Table tags 0–62, in the order the WOFF2 spec numbers them. */
const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post',
  'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea',
  'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop',
  'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
]

/** The spec's variable-length integer: 7 bits a byte, high bit continues. */
function readBase128(buf, pos) {
  let value = 0
  for (let i = 0; i < 5; i++) {
    const b = buf[pos++]
    if (b === undefined) throw new Error('woff2: truncated UIntBase128')
    // A leading zero byte would allow two encodings of the same number.
    if (i === 0 && b === 0x80) throw new Error('woff2: non-canonical UIntBase128')
    value = value * 128 + (b & 0x7f)
    if ((b & 0x80) === 0) return [value, pos]
  }
  throw new Error('woff2: overlong UIntBase128')
}

/**
 * Pull the named tables out of a WOFF2 file as raw sfnt table buffers.
 * Returns a Map of tag -> Buffer, holding only the tags asked for.
 */
export function readWoff2Tables(buf, wanted) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2')
    throw new Error('woff2: not a WOFF2 file')
  const numTables = buf.readUInt16BE(12)
  const totalCompressedSize = buf.readUInt32BE(20)

  let pos = 48
  const dir = []
  for (let i = 0; i < numTables; i++) {
    const flags = buf[pos++]
    const tagIndex = flags & 0x3f
    const transformVersion = (flags >> 6) & 0x03
    let tag
    if (tagIndex === 0x3f) {
      tag = buf.toString('latin1', pos, pos + 4)
      pos += 4
    } else {
      tag = KNOWN_TAGS[tagIndex]
      if (!tag) throw new Error(`woff2: unknown tag index ${tagIndex}`)
    }
    let origLength
    ;[origLength, pos] = readBase128(buf, pos)

    /*
     * A transformLength is present only when the table is actually stored
     * transformed. glyf and loca are transformed at version 0 — the default —
     * and untransformed at version 3; every other table is the other way
     * round. Getting this wrong does not fail here, it silently shifts every
     * later table's offset, so it is worth stating plainly.
     */
    const transformed =
      tag === 'glyf' || tag === 'loca'
        ? transformVersion === 0
        : transformVersion !== 0
    let transformLength = null
    if (transformed) [transformLength, pos] = readBase128(buf, pos)

    dir.push({ tag, length: transformed ? transformLength : origLength, transformed })
  }

  const compressed = buf.subarray(pos, pos + totalCompressedSize)
  const data = brotliDecompressSync(compressed)

  const out = new Map()
  let offset = 0
  for (const entry of dir) {
    if (wanted.includes(entry.tag)) {
      if (entry.transformed)
        throw new Error(`woff2: ${entry.tag} is transformed; cannot read raw`)
      out.set(entry.tag, data.subarray(offset, offset + entry.length))
    }
    offset += entry.length
  }
  if (offset > data.length)
    throw new Error(
      `woff2: table directory runs past the decompressed stream ` +
        `(${offset} > ${data.length}) — offsets are wrong`,
    )
  return out
}

/** Every Unicode codepoint the cmap maps to a glyph. */
export function readCmap(table) {
  const codepoints = new Set()
  const numSubtables = table.readUInt16BE(2)
  for (let i = 0; i < numSubtables; i++) {
    const rec = 4 + i * 8
    const platformID = table.readUInt16BE(rec)
    const encodingID = table.readUInt16BE(rec + 2)
    const offset = table.readUInt32BE(rec + 4)
    // Unicode subtables only. A (1,0) Macintosh table is legacy 8-bit and
    // would add codepoints that are not really covered.
    const unicode =
      platformID === 0 || (platformID === 3 && (encodingID === 1 || encodingID === 10))
    if (!unicode) continue
    const format = table.readUInt16BE(offset)
    if (format === 4) {
      const segCountX2 = table.readUInt16BE(offset + 6)
      const segCount = segCountX2 / 2
      const endBase = offset + 14
      const startBase = endBase + segCountX2 + 2
      const deltaBase = startBase + segCountX2
      const rangeBase = deltaBase + segCountX2
      for (let s = 0; s < segCount; s++) {
        const end = table.readUInt16BE(endBase + s * 2)
        const start = table.readUInt16BE(startBase + s * 2)
        if (start > end) continue
        const delta = table.readInt16BE(deltaBase + s * 2)
        const rangeOffset = table.readUInt16BE(rangeBase + s * 2)
        for (let c = start; c <= end && c !== 0x10000; c++) {
          let glyph
          if (rangeOffset === 0) glyph = (c + delta) & 0xffff
          else {
            const gi = rangeBase + s * 2 + rangeOffset + (c - start) * 2
            if (gi + 1 >= table.length) continue
            glyph = table.readUInt16BE(gi)
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff
          }
          if (glyph !== 0) codepoints.add(c)
        }
      }
    } else if (format === 12) {
      const nGroups = table.readUInt32BE(offset + 12)
      for (let g = 0; g < nGroups; g++) {
        const rec2 = offset + 16 + g * 12
        const start = table.readUInt32BE(rec2)
        const end = table.readUInt32BE(rec2 + 4)
        const startGlyph = table.readUInt32BE(rec2 + 8)
        if (startGlyph === 0 && start === 0) continue
        for (let c = start; c <= end; c++) codepoints.add(c)
      }
    }
    // Formats 0, 6 and 13 are not used by any font this repo ships. If one
    // turns up its codepoints are simply absent, which fails the coverage
    // check loudly rather than passing something unverified.
  }
  return codepoints
}

/** name records as a Map of nameID -> string, preferring the English entry. */
export function readNames(table) {
  const count = table.readUInt16BE(2)
  const stringOffset = table.readUInt16BE(4)
  const out = new Map()
  for (let i = 0; i < count; i++) {
    const rec = 6 + i * 12
    const platformID = table.readUInt16BE(rec)
    const encodingID = table.readUInt16BE(rec + 2)
    const languageID = table.readUInt16BE(rec + 4)
    const nameID = table.readUInt16BE(rec + 6)
    const length = table.readUInt16BE(rec + 8)
    const offset = table.readUInt16BE(rec + 10)
    const bytes = table.subarray(
      stringOffset + offset,
      stringOffset + offset + length,
    )
    // Windows and modern Unicode records are UTF-16BE; Macintosh Roman is
    // close enough to latin1 for the ASCII these strings are made of.
    const utf16 = platformID === 3 || platformID === 0
    let value
    try {
      value = utf16 ? bytes.swap16().toString('utf16le') : bytes.toString('latin1')
    } catch {
      continue // odd length; not a valid UTF-16 record
    }
    const english = platformID === 3 ? languageID === 0x0409 : languageID === 0
    if (!out.has(nameID) || english) out.set(nameID, value)
  }
  return out
}

/** Read a WOFF2 file's cmap codepoints and name records in one go. */
export function readFontFacts(buf) {
  const tables = readWoff2Tables(buf, ['cmap', 'name'])
  const cmapTable = tables.get('cmap')
  const nameTable = tables.get('name')
  if (!cmapTable) throw new Error('woff2: no cmap table')
  return {
    cmap: readCmap(cmapTable),
    names: nameTable ? readNames(nameTable) : new Map(),
  }
}
