import type { SurahView } from '../catalog/types'

export type MediaHandlers = {
  next: () => void
  prev: () => void
  /** Seek by one ayah. Falls back to a fixed step where no timings exist. */
  step: (direction: 1 | -1) => void
  play: () => void
  pause: () => void
  stop: () => void
  seek: (seconds: number, fast?: boolean) => void
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
    if (typeof d.seekTime !== 'number') return
    // fastSeek is what a drag sends while the finger is still moving: the OS
    // is asking for a cheap approximate jump, and answering every one of them
    // precisely is what makes a scrub feel like it is fighting back.
    ref.current?.seek(d.seekTime, d.fastSeek === true)
  })
}

/**
 * Grey out a transport button rather than leaving it lit and inert — and put
 * it back when it applies again.
 *
 * Restoring is the whole point. This used to only ever remove handlers, so
 * starting at surah 1 (which is what pressing play with nothing chosen does)
 * nulled `previoustrack` for the life of the page, and reaching the last
 * surah nulled `nexttrack` the same way. In a car, the buttons died from the
 * first surah played and only a reload brought them back.
 *
 * The live handlers are the ones registered by registerMediaHandlers, so the
 * ref is passed back in here rather than captured.
 */
export function setNavAvailability(
  hasPrev: boolean,
  hasNext: boolean,
  ref?: { current: MediaHandlers | null },
) {
  const s = ms()
  if (!s) return
  const set = (action: MediaSessionAction, fn: (() => void) | null) => {
    try {
      s.setActionHandler(action, fn)
    } catch {
      /* older engines reject actions they do not know */
    }
  }
  set('nexttrack', hasNext && ref ? () => ref.current?.next() : null)
  set('previoustrack', hasPrev && ref ? () => ref.current?.prev() : null)
}

export function setPlaybackState(state: MediaSessionPlaybackState) {
  const s = ms()
  if (s) s.playbackState = state
}

/**
 * Tell the OS where we are, so the lock screen and the car draw a real
 * progress bar. The rate must be the true one: the system extrapolates between
 * calls, so reporting 1 while playing at 1.25 makes the bar drift further
 * ahead for the whole of a two-hour surah.
 *
 * Reporting it too often is what breaks scrubbing.
 *
 * The lock screen and the Dynamic Island own the scrubber while a finger is on
 * it. Every setPositionState call re-asserts where we think we are, so pushing
 * one four times a second — which is what timeupdate fires at — drags the
 * thumb back out from under the finger and the seek never lands. Once a second
 * is plenty for a progress bar, and while a seek is in flight we say nothing
 * at all and let the OS lead.
 */
const POSITION_EVERY_MS = 1000
let lastPositionAt = 0
let seeking = false

/** Called from the engine's seeking/seeked listeners. */
export function setSeeking(active: boolean) {
  seeking = active
  // Report once the moment it lands, so the bar settles where it was dropped
  // rather than waiting out the interval.
  if (!active) lastPositionAt = 0
}

export function setPosition(el: HTMLAudioElement, force = false) {
  const s = ms()
  if (!s?.setPositionState) return
  if (seeking && !force) return
  const now = Date.now()
  if (!force && now - lastPositionAt < POSITION_EVERY_MS) return
  const duration = el.duration
  if (!Number.isFinite(duration) || duration <= 0) return
  lastPositionAt = now
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
