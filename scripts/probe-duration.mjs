/**
 * Prints the exact duration of remote MP3s.
 *
 * Used to decide whether a third-party word-timing set describes the same
 * recording we serve. Timings only transfer between identical recordings, and
 * duration is the cheapest way to tell two apart — a public "Al-Dosari" set
 * turned out to be an older, slower reading, which this catches immediately.
 */
const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }

function durationOf(buf, total) {
  if (buf.length < 12) return null
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') return null
  let off = 0
  if (buf.slice(0, 3).toString('latin1') === 'ID3') {
    off =
      10 +
      (((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f))
  }
  while (off < buf.length - 4 && !(buf[off] === 0xff && (buf[off + 1] & 0xe0) === 0xe0)) off++
  if (off >= buf.length - 4) return null
  const h1 = buf[off + 1],
    h2 = buf[off + 2],
    h3 = buf[off + 3]
  const ver = (h1 >> 3) & 3
  const layer = (h1 >> 1) & 3
  const brIdx = (h2 >> 4) & 0xf
  const srIdx = (h2 >> 2) & 3
  if (ver === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) return null
  const br = (ver === 3 ? BR1 : BR2)[brIdx] * 1000
  const sr = (SR[ver] || SR[3])[srIdx]
  const chan = (h3 >> 6) & 3
  const x = off + 4 + (ver === 3 ? (chan === 3 ? 17 : 32) : chan === 3 ? 9 : 17)
  const tag = buf.slice(x, x + 4).toString('latin1')
  if (tag === 'Xing' || tag === 'Info') {
    const flags = buf.readUInt32BE(x + 4)
    // A frame count is an exact measurement; a bitrate estimate is not, and
    // for these comparisons only the exact number is worth reporting.
    if (flags & 1) {
      return { seconds: (buf.readUInt32BE(x + 8) * (ver === 3 ? 1152 : 576)) / sr, exact: true }
    }
  }
  return br ? { seconds: ((total - off) * 8) / br, exact: false } : null
}

export async function measure(url) {
  const head = await fetch(url, { headers: { Range: 'bytes=0-262143' } })
  if (!head.ok && head.status !== 206) throw new Error(`HTTP ${head.status} ${url}`)
  const buf = Buffer.from(await head.arrayBuffer())
  const cr = head.headers.get('content-range')
  const total = cr ? Number(cr.split('/')[1]) : Number(head.headers.get('content-length') || 0)
  return { ...(durationOf(buf, total) ?? { seconds: null, exact: false }), bytes: total }
}

if (process.argv[1].endsWith('probe-duration.mjs')) {
  const urls = process.argv.slice(2)
  for (const u of urls) {
    try {
      const r = await measure(u)
      const s = r.seconds
      console.log(
        `${s === null ? '  unreadable' : `${s.toFixed(2).padStart(9)}s`} ${r.exact ? 'exact' : 'est  '} ${String(r.bytes).padStart(10)}B  ${u}`,
      )
    } catch (e) {
      console.log(`  FAILED ${e.message}`)
    }
  }
}
