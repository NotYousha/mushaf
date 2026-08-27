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

const WINDOW = 262144

const range = async (url, from, to) => {
  const r = await fetch(url, { headers: { Range: `bytes=${from}-${to}` } })
  if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status} ${url}`)
  const cr = r.headers.get('content-range')
  return {
    buf: Buffer.from(await r.arrayBuffer()),
    total: cr ? Number(cr.split('/')[1]) : Number(r.headers.get('content-length') || 0),
  }
}

/**
 * Duration, following the tag rather than hoping it is short.
 *
 * The first window used to be the only one, and a file whose embedded cover art
 * runs past it read as `unreadable` — not "no frames", but "the frames are
 * further in than we looked". Ali Jaber's whole set on quranicaudio is like
 * that: a 419 KB ID3 tag against a 256 KB window, so every surah of his
 * measured as nothing at all. A duration probe that silently reports null is
 * worse than one that fails, because null is what a genuinely bad file looks
 * like too, and this one is used to decide whether a timing set describes the
 * recording we serve.
 *
 * So when the tag says the audio starts beyond what was fetched, one more
 * request is made from where the tag ends. Two requests at most, and only for
 * the files that need it.
 */
export async function measure(url) {
  const first = await range(url, 0, WINDOW - 1)
  const { buf, total } = first

  if (buf.slice(0, 3).toString('latin1') === 'ID3') {
    const tag =
      10 +
      (((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f))
    if (tag >= buf.length && tag < total) {
      const next = await range(url, tag, Math.min(tag + WINDOW - 1, total - 1))
      // durationOf expects the tag at the front, so hand it a buffer that has
      // one: ten bytes of header declaring a zero-length tag, then the audio.
      const stub = Buffer.alloc(10)
      stub.write('ID3', 0, 'latin1')
      stub[3] = 3
      return {
        ...(durationOf(Buffer.concat([stub, next.buf]), total - tag + 10) ?? {
          seconds: null,
          exact: false,
        }),
        bytes: total,
      }
    }
  }

  return { ...(durationOf(buf, total) ?? { seconds: null, exact: false }), bytes: total }
}

// argv[1] is undefined under `node -e` and `node --input-type=module`, where
// this module is imported rather than run — and reading .endsWith off it threw
// before any caller could use measure().
if (process.argv[1]?.endsWith('probe-duration.mjs')) {
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
