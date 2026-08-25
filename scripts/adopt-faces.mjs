/**
 * Turns a portraits file exported from the app into bundled assets.
 *
 *   node scripts/adopt-faces.mjs ~/Downloads/mushaf-photos-2026-08-25-01-12.json
 *
 * Settings → Reciter photos → "Save photos to a file" writes every portrait
 * along with the framing the listener chose for it, separately for the player's
 * circle and the dock's card. This takes that file and makes those portraits
 * part of the app, so they reach every device instead of living on the one
 * phone they were added to.
 *
 * The framing is carried across rather than baked into the pixels. One file
 * then serves both surfaces, and a crop can still be changed later without the
 * original having been thrown away — which is the whole reason the app stores
 * a picture whole in the first place.
 *
 * Two kinds of row arrive here. One carries a photograph, which becomes a file
 * in public/. The other carries only a framing, for a portrait that already
 * ships — someone moved a face in the ring without replacing it — and there is
 * nothing to write but the numbers.
 *
 * And two kinds of subject. An imam of a Taraweeh year is wired into
 * data/imams.json. A reciter of an individual mushaf is not in that roster and
 * must not be added to it, because being in it means having led a Ramadan;
 * his framing goes to data/reciter-frames.json instead, which the catalog is
 * decorated with at load. His photograph keeps the name the catalog already
 * asks for, so the file is replaced rather than orphaned.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const src = process.argv[2]
if (!src) {
  console.error('usage: node scripts/adopt-faces.mjs <exported-photos.json>')
  process.exit(1)
}
if (!existsSync(src)) {
  console.error(`no such file: ${src}`)
  process.exit(1)
}

const doc = JSON.parse(readFileSync(src, 'utf8'))
if (doc?.kind !== 'mushaf-faces' || !doc.faces) {
  console.error('That is not a portraits file exported from the app.')
  process.exit(1)
}

const imams = JSON.parse(readFileSync('data/imams.json', 'utf8'))
const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'))
const FRAMES_PATH = 'data/reciter-frames.json'
const reciterFrames = existsSync(FRAMES_PATH)
  ? JSON.parse(readFileSync(FRAMES_PATH, 'utf8'))
  : {}
/** Catalog entries by id, so a mushaf reciter can be recognised. */
const reciters = Object.fromEntries((catalog.reciters ?? []).map((r) => [r.id, r]))
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }

const isDefault = (f) => !f || (f.zoom === 100 && f.x === 50 && f.y === 50)

/** Only the surfaces that actually differ from centred-and-whole. */
const chosen = (face) => {
  const out = {}
  if (!isDefault(face.frames?.player)) out.player = face.frames.player
  if (!isDefault(face.frames?.card)) out.card = face.frames.card
  return out
}

let written = 0
let reframed = 0
const unknown = []
for (const [id, face] of Object.entries(doc.faces)) {
  /*
   * A mushaf reciter, not an imam. His framing is kept beside the catalog and
   * his photograph, if one came, replaces the file the catalog already names.
   */
  if (!imams[id] && reciters[id]) {
    const frames = chosen(face)
    if (face.data) {
      const ext = EXT[face.type] ?? 'webp'
      // Keep the name the catalog asks for where there is one, so nothing has
      // to be rewired; otherwise name it after the entry.
      const name = reciters[id].photo ?? `${id}.${ext}`
      writeFileSync(`public/${name}`, Buffer.from(face.data, 'base64'))
      const kb = (Buffer.from(face.data, 'base64').length / 1024).toFixed(0)
      console.log(`  ${reciters[id].nameEn.padEnd(26)} ${name.padEnd(22)} ${kb} KB`)
      written++
    }
    if (Object.keys(frames).length) {
      reciterFrames[id] = frames
      reframed++
      console.log(
        `  ${reciters[id].nameEn.padEnd(26)} framing ${JSON.stringify(frames)}`,
      )
    } else {
      // Back to centred: drop the entry rather than storing the default.
      delete reciterFrames[id]
    }
    continue
  }

  if (!imams[id]) {
    unknown.push(id)
    continue
  }
  // Only worth recording where it differs from centred; the CSS default
  // already covers a picture that needs no nudging.
  const frames = chosen(face)
  if (Object.keys(frames).length) imams[id].frames = frames
  else delete imams[id].frames

  // A row with no picture is a framing for the portrait that already ships.
  // Writing a file from it would mean decoding nothing at all.
  if (!face.data) {
    const back = !Object.keys(frames).length
    if (!back) reframed++
    console.log(
      `  ${imams[id].nameEn.padEnd(26)} ` +
        (back ? 'back to centred' : `framing ${JSON.stringify(frames)}`),
    )
    continue
  }

  const ext = EXT[face.type] ?? 'webp'
  const name = `imam-${id}.${ext}`
  writeFileSync(`public/${name}`, Buffer.from(face.data, 'base64'))
  imams[id].photo = name

  written++
  const kb = (Buffer.from(face.data, 'base64').length / 1024).toFixed(0)
  console.log(`  ${imams[id].nameEn.padEnd(26)} ${name.padEnd(22)} ${kb} KB`)
}

if (unknown.length) {
  console.warn(
    `\n${unknown.length} portrait(s) matched neither an imam nor a reciter ` +
      `and were skipped: ${unknown.join(', ')}`,
  )
}

// One imam per line, which keeps a roster diff readable.
const keys = Object.keys(imams)
const body = keys
  .map((k, i) => ` ${JSON.stringify(k)}: ${JSON.stringify(imams[k])}${i < keys.length - 1 ? ',' : ''}`)
  .join('\n')
writeFileSync('data/imams.json', `{\n${body}\n}\n`)

// One reciter per line, for the same reason.
const rk = Object.keys(reciterFrames).sort()
writeFileSync(
  FRAMES_PATH,
  rk.length
    ? `{\n${rk
        .map((k, i) => ` ${JSON.stringify(k)}: ${JSON.stringify(reciterFrames[k])}${i < rk.length - 1 ? ',' : ''}`)
        .join('\n')}\n}\n`
    : '{}\n',
)

console.log(
  `\nbundled ${written} portrait(s) into public/` +
    (reframed ? ` and took ${reframed} framing(s)` : ''),
)
console.log('they now ship with the app, framing and all')
