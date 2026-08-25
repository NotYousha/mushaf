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
 * What the system has actually asked us to do, kept for the phone to show.
 *
 * None of this is visible from a laptop. A lock screen that will not scrub
 * either never sends the command or sends one we mishandle, and those two
 * have opposite fixes — so the app records what arrives and the Lock screen
 * panel reads it back, instead of another round of guessing.
 */
export type RemoteEvent = {
  action: string
  /** Milliseconds since the page loaded, which is enough to see ordering. */
  at: number
  seekTime?: number
  fastSeek?: boolean
}

const LOG_MAX = 24
const log: RemoteEvent[] = []
const registered = new Set<string>()

function note(e: RemoteEvent) {
  log.push(e)
  if (log.length > LOG_MAX) log.shift()
}

export const remoteLog = (): RemoteEvent[] => [...log]
export const registeredActions = (): string[] => [...registered].sort()

/**
 * Whether this system's Now Playing screen would hide the surah buttons.
 *
 * Apple's lock screen and Dynamic Island give the transport exactly two slots
 * either side of play/pause, and MediaRemote fills them by precedence: if a
 * page registers `seekforward`/`seekbackward`, WebKit enables the system's
 * skip commands, and skip outranks track. The ±15s arrows appear and the
 * next-surah button is not drawn at all — no matter that `nexttrack` is
 * registered and working. That is the whole reason the surah could not be
 * changed from a locked phone.
 *
 * So on Apple the seek handlers are left off, and the two slots go to the
 * surah. Nothing is lost that the screen does not already offer: the scrubber
 * is right there for moving within a recitation, and a Taraweeh surah runs
 * long enough that fifteen seconds is not the jump anyone wants from it.
 *
 * Everywhere else both fit, so both stay.
 */
function skipCommandsHideTrackButtons(): boolean {
  const ua = navigator.userAgent ?? ''
  // An iPad reports itself as a Mac and is distinguished by having a
  // touchscreen, which no Mac has.
  return /iPhone|iPad|iPod|Macintosh/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1)
}

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
      registered.add(action)
    } catch {
      // Older engines reject actions they do not know. Not fatal.
    }
  }

  const seen = (action: string, extra?: Partial<RemoteEvent>) =>
    note({ action, at: Math.round(performance.now()), ...extra })

  on('play', () => {
    seen('play')
    ref.current?.play()
  })
  on('pause', () => {
    seen('pause')
    ref.current?.pause()
  })
  on('stop', () => {
    seen('stop')
    ref.current?.stop()
  })
  on('nexttrack', () => {
    seen('nexttrack')
    ref.current?.next()
  })
  on('previoustrack', () => {
    seen('previoustrack')
    ref.current?.prev()
  })
  // Headphone long-press and a car's FF/REW arrive here. The supplied
  // seekOffset is deliberately ignored: stepping by ayah is far more useful
  // in a recitation than jumping a fixed number of seconds.
  //
  // Registered only where they do not cost the surah buttons their place.
  if (!skipCommandsHideTrackButtons()) {
    on('seekforward', () => {
      seen('seekforward')
      ref.current?.step(1)
    })
    on('seekbackward', () => {
      seen('seekbackward')
      ref.current?.step(-1)
    })
  }
  on('seekto', (d) => {
    seen('seekto', { seekTime: d.seekTime, fastSeek: d.fastSeek === true })
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
  hasNext: boolean,
  ref?: { current: MediaHandlers | null },
) {
  const s = ms()
  if (!s) return
  const set = (action: MediaSessionAction, fn: (() => void) | null) => {
    try {
      s.setActionHandler(action, fn)
      if (fn) registered.add(action)
      else registered.delete(action)
    } catch {
      /* older engines reject actions they do not know */
    }
  }
  set('nexttrack', hasNext && ref ? () => ref.current?.next() : null)
  /**
   * Previous takes no availability argument, because it always has work: its
   * first job is to restart the surah in hand, which is the only way to begin
   * a Taraweeh recitation again from a locked phone. Whether a second press
   * can leave the surah is the handler's business, not the button's.
   */
  set('previoustrack', ref ? () => ref.current?.prev() : null)
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
/**
 * How long silence may last before we assume the seek is never landing.
 *
 * `seeking` fires without a matching `seeked` more often than it should — a
 * jump into an unbuffered stretch of a two-hour stream can stall indefinitely.
 * Without this the flag would stay raised, position would never be reported
 * again, and the lock screen would sit frozen: the exact failure this code is
 * meant to prevent.
 */
const SEEK_GIVE_UP_MS = 4000

let lastPositionAt = 0
let seeking = false
let seekTimer: ReturnType<typeof setTimeout> | null = null

/** Called from the engine's seeking/seeked listeners. */
export function setSeeking(active: boolean) {
  seeking = active
  if (seekTimer) {
    clearTimeout(seekTimer)
    seekTimer = null
  }
  if (active) {
    seekTimer = setTimeout(() => {
      seeking = false
      seekTimer = null
    }, SEEK_GIVE_UP_MS)
    return
  }
  // Report once the moment it lands, so the bar settles where it was dropped
  // rather than waiting out the interval.
  lastPositionAt = 0
}

/**
 * The rate we last told the system, and the imperceptible nudge that gets a
 * position update accepted at all.
 *
 * WebKit decides whether to forward a Now Playing update to the system by
 * comparing it against the last one — and the fields it compares are the
 * identifier, the metadata, the duration, the rate, seekability, whether it
 * is playing, and whether it is visible. The position is not among them.
 *
 * So an update that changes only the position is dropped and never reaches
 * the lock screen. That is exactly what a seek is. Drop the scrubber
 * anywhere and the app obeys, the audio moves, and the system — never told —
 * carries on extrapolating from where it last thought we were and springs
 * the thumb back. The seek worked; only the report of it was thrown away.
 *
 * The rate is compared, and the system uses it only to run the playhead
 * forward between updates. Alternating it by a ten-thousandth is therefore
 * enough to make the update land, and drifts the bar by a third of a second
 * per hour — against a fresh position every second, which is to say never.
 * Nothing audible changes: this is the number we report, not the number we
 * play at.
 */
let ratePhase = 0

export function setPosition(el: HTMLAudioElement, force = false) {
  const s = ms()
  if (!s?.setPositionState) return
  if (seeking && !force) return
  const now = Date.now()
  if (!force && now - lastPositionAt < POSITION_EVERY_MS) return
  const duration = el.duration
  if (!Number.isFinite(duration) || duration <= 0) return
  lastPositionAt = now
  // A rate of zero throws; a paused player is expressed by playbackState.
  const real = el.playbackRate || 1
  // Only a forced update needs to be certain of landing — the periodic ones
  // are only correcting drift the system is already handling.
  if (force) ratePhase = ratePhase ? 0 : 1
  try {
    s.setPositionState({
      duration,
      position: Math.min(Math.max(el.currentTime, 0), duration),
      playbackRate: ratePhase ? real * 1.0001 : real,
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
