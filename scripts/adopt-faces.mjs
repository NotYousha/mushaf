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
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }

const isDefault = (f) => !f || (f.zoom === 100 && f.x === 50 && f.y === 50)

let written = 0
const unknown = []
for (const [id, face] of Object.entries(doc.faces)) {
  if (!imams[id]) {
    unknown.push(id)
    continue
  }
  const ext = EXT[face.type] ?? 'webp'
  const name = `imam-${id}.${ext}`
  writeFileSync(`public/${name}`, Buffer.from(face.data, 'base64'))

  imams[id].photo = name
  // Only worth recording where it differs from centred; the CSS default
  // already covers a picture that needs no nudging.
  const frames = {}
  if (!isDefault(face.frames?.player)) frames.player = face.frames.player
  if (!isDefault(face.frames?.card)) frames.card = face.frames.card
  if (Object.keys(frames).length) imams[id].frames = frames
  else delete imams[id].frames

  written++
  const kb = (Buffer.from(face.data, 'base64').length / 1024).toFixed(0)
  console.log(`  ${imams[id].nameEn.padEnd(26)} ${name.padEnd(22)} ${kb} KB`)
}

if (unknown.length) {
  console.warn(`\n${unknown.length} portrait(s) matched no imam and were skipped: ${unknown.join(', ')}`)
}

// One imam per line, which keeps a roster diff readable.
const keys = Object.keys(imams)
const body = keys
  .map((k, i) => ` ${JSON.stringify(k)}: ${JSON.stringify(imams[k])}${i < keys.length - 1 ? ',' : ''}`)
  .join('\n')
writeFileSync('data/imams.json', `{\n${body}\n}\n`)

console.log(`\nbundled ${written} portrait(s) into public/ and wired them in data/imams.json`)
console.log('they now ship with the app, framing and all')
