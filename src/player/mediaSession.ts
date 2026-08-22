import type { SurahView } from '../catalog/types'

export type MediaHandlers = {
  next: () => void
  prev: () => void
  /** Seek by one ayah. Falls back to a fixed step where no timings exist. */
  step: (direction: 1 | -1) => void
  play: () => void
  pause: () => void
  stop: () => void
  seek: (seconds: number) => void
}

const ms = () =>
  (navigator as unknown as { mediaSession?: MediaSession })?.mediaSession ?? null

/**
 * Register the action handlers once, for the life of the page.
 *
 * They previously went up inside playSurah, so each call captured that
 * render's surah and closed over it — after a few auto-advances the
 * lock-screen previous button pointed at whatever was playing several tracks
 * ago. Handlers now read through a mutable reference the app keeps current,
 * so they cannot go stale.
 */
export function registerMediaHandlers(ref: { current: MediaHandlers | null }) {
  const s = ms()
  if (!s) return

  const on = (
    action: MediaSessionAction,
    fn: ((details: MediaSessionActionDetails) => void) | null,
  ) => {
    try {
      s.setActionHandler(action, fn)
    } catch {
      // Older engines reject actions they do not know. Not fatal.
    }
  }

  on('play', () => ref.current?.play())
  on('pause', () => ref.current?.pause())
  on('stop', () => ref.current?.stop())
  on('nexttrack', () => ref.current?.next())
  on('previoustrack', () => ref.current?.prev())
  // Headphone long-press and a car's FF/REW arrive here. The supplied
  // seekOffset is deliberately ignored: stepping by ayah is far more useful
  // in a recitation than jumping a fixed number of seconds.
  on('seekforward', () => ref.current?.step(1))
  on('seekbackward', () => ref.current?.step(-1))
  on('seekto', (d) => {
    if (typeof d.seekTime === 'number') ref.current?.seek(d.seekTime)
  })
}

/** Grey out a transport button rather than leaving it lit and inert. */
export function setNavAvailability(hasPrev: boolean, hasNext: boolean) {
  const s = ms()
  if (!s) return
  try {
    if (!hasNext) s.setActionHandler('nexttrack', null)
    if (!hasPrev) s.setActionHandler('previoustrack', null)
  } catch {
    /* ignore */
  }
}

export function setPlaybackState(state: MediaSessionPlaybackState) {
  const s = ms()
  if (s) s.playbackState = state
}

/**
 * Tell the OS where we are, so the lock screen and car draw a real progress
 * bar. The rate must be the true one: the system extrapolates between calls,
 * so reporting 1 while playing at 1.25 makes the bar drift further ahead for
 * the whole of a two-hour surah.
 */
export function setPosition(el: HTMLAudioElement) {
  const s = ms()
  if (!s?.setPositionState) return
  const duration = el.duration
  if (!Number.isFinite(duration) || duration <= 0) return
  try {
    s.setPositionState({
      duration,
      position: Math.min(Math.max(el.currentTime, 0), duration),
      // A rate of zero throws; a paused player is expressed by playbackState.
      playbackRate: el.playbackRate || 1,
    })
  } catch {
    // Position state is best-effort; never let it break playback.
  }
}

export function clearPosition() {
  const s = ms()
  if (!s?.setPositionState) return
  try {
    s.setPositionState({})
  } catch {
    /* ignore */
  }
}

const ARTWORK_SIZES = [96, 128, 192, 256, 384, 512]

/**
 * Update what the lock screen shows.
 *
 * Arabic and English are kept in separate fields rather than joined. A single
 * string mixing an RTL run, a neutral separator and an LTR run is laid out
 * according to the reader's locale, which puts the separator and any digits in
 * visually wrong places on an English phone — and head units truncate hard
 * enough that a combined string loses one language entirely.
 */
export function updateMetadata(s: SurahView, reciter: string, base: string) {
  const session = ms()
  if (!session) return
  const MM = (globalThis as unknown as { MediaMetadata?: typeof MediaMetadata }).MediaMetadata
  if (!MM) return
  try {
    session.metadata = new MM({
      title: s.name,
      artist: reciter,
      album: s.nameEn,
      artwork: ARTWORK_SIZES.map((size) => ({
        src: `${base}icon-512.png`,
        sizes: `${size}x${size}`,
        type: 'image/png',
      })),
    })
  } catch {
    /* ignore */
  }
}

export function clearMetadata() {
  const s = ms()
  if (s) s.metadata = null
}
