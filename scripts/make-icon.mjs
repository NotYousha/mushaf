/**
 * Generates public/icon-512.png — the PWA install icon.
 *
 * Written by hand rather than pulled from an image library: the app has no
 * other need for one, and a 512x512 flat-colour mark is a few hundred lines
 * of arithmetic against a multi-megabyte native dependency.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const SIZE = 512
const CREAM = [0xf5, 0xed, 0xda]
const GOLD = [0xc9, 0xa9, 0x61]
const GOLD_DEEP = [0xb8, 0x97, 0x4f]
const BROWN = [0x5b, 0x42, 0x27]

// Eight-point girih star, the motif used behind the app.
const POINTS = 8
const R_OUT = 196
const R_IN = 92
const CX = SIZE / 2
const CY = SIZE / 2

const star = []
for (let i = 0; i < POINTS * 2; i++) {
  const r = i % 2 === 0 ? R_OUT : R_IN
  const a = (i / (POINTS * 2)) * Math.PI * 2 - Math.PI / 2
  star.push([CX + r * Math.cos(a), CY + r * Math.sin(a)])
}

function inPolygon(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const px = Buffer.alloc(SIZE * SIZE * 3)
const put = (i, c) => {
  px[i] = c[0]
  px[i + 1] = c[1]
  px[i + 2] = c[2]
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 3
    const d = Math.hypot(x - CX, y - CY)

    if (d > 246) put(i, CREAM)            // corner field
    else if (d > 238) put(i, GOLD_DEEP)   // outer keyline
    else if (d > 232) put(i, CREAM)
    else if (d > 226) put(i, GOLD)        // inner keyline
    else if (inPolygon(x, y, star)) put(i, d < R_IN - 26 ? BROWN : GOLD_DEEP)
    else put(i, CREAM)
  }
}

// PNG scanlines: one filter byte (0 = None) per row.
const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1))
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 3 + 1)] = 0
  px.copy(raw, y * (SIZE * 3 + 1) + 1, y * SIZE * 3, (y + 1) * SIZE * 3)
}

const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return (buf) => {
    let c = -1
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
})()

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(CRC(body))
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 2 // truecolour RGB
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

writeFileSync('public/icon-512.png', png)
console.log(`wrote public/icon-512.png (${(png.length / 1024).toFixed(1)} kB)`)
