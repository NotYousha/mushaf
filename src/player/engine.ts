import { getAudio } from '../db/audio'
import { savePosition } from '../db/prefs'
import {
  clearPosition,
  registerMediaHandlers,
  setPlaybackState,
  setPosition,
  setSeeking,
  type MediaHandlers,
} from './mediaSession'

export type PlaybackMode = 'offline' | 'streaming'

export type LoadResult =
  | { ok: true; mode: PlaybackMode }
  | { ok: false; reason: string }

/**
 * Streaming-first playback.
 *
 * A saved surah plays from its IndexedDB copy. Anything else streams straight
 * from the catalog URL — archive.org honours range requests, so the browser
 * seeks without pulling the whole file.
 *
 * Two hard-won details:
 *  - No `crossOrigin`. It is unnecessary here (no canvas or Web Audio access)
 *    and makes playback fail silently across archive.org's redirect chain.
 *  - Every entry carries a fallback URL. Archive.org serves from numbered
 *    nodes that rotate and occasionally return 500, so a failed load retries
 *    on the alternate host before giving up.
 */
export class PlayerEngine {
  readonly el: HTMLAudioElement
  private objectUrl: string | null = null
  private currentSurah: number | null = null
  private currentReciter: string | null = null
  private lastSaved = 0
  mode: PlaybackMode = 'streaming'
  onError: ((message: string) => void) | null = null
  /** Read by the media session handlers, which are registered once. */
  readonly handlers: { current: MediaHandlers | null } = { current: null }
  private rate = 1

  constructor() {
    this.el = new Audio()
    this.el.preload = 'metadata'

    this.el.addEventListener('timeupdate', () => {
      const t = this.el.currentTime
      if (this.currentSurah !== null && this.currentReciter && Math.abs(t - this.lastSaved) > 5) {
        this.lastSaved = t
        void savePosition(this.currentReciter, this.currentSurah, t)
      }
    })

    const flush = () => {
      if (this.currentSurah !== null && this.currentReciter) {
        void savePosition(this.currentReciter, this.currentSurah, this.el.currentTime)
      }
    }
    this.el.addEventListener('pause', flush)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', flush)
    }

    // Keep the OS in step. The system extrapolates position between updates,
    // so it must be corrected whenever the rate, the position, or the play
    // state changes — not only while ticking.
    const sync = () => setPosition(this.el)
    // While the OS is scrubbing, stop reporting where we think we are — the
    // scrubber belongs to the finger until it lets go.
    this.el.addEventListener('seeking', () => setSeeking(true))
    this.el.addEventListener('seeked', () => {
      setSeeking(false)
      setPosition(this.el, true)
    })
    // A stall during a seek must not leave the lock screen frozen.
    this.el.addEventListener('stalled', () => setSeeking(false))
    this.el.addEventListener('error', () => setSeeking(false))
    // The moment sound actually starts is when the OS most needs an anchor.
    this.el.addEventListener('playing', () => setPosition(this.el, true))
    this.el.addEventListener('loadedmetadata', () => {
      // A resource load resets playbackRate to defaultPlaybackRate, which
      // silently dropped the listener's chosen speed back to 1x on every
      // surah change. Reassert it here as well as setting both on change.
      this.el.playbackRate = this.rate
      sync()
    })
    // A new duration changes the whole scale, so it is worth saying at once.
    this.el.addEventListener('durationchange', () => setPosition(this.el, true))
    this.el.addEventListener('seeked', sync)
    this.el.addEventListener('ratechange', sync)
    this.el.addEventListener('timeupdate', sync)
    this.el.addEventListener('play', () => {
      setPlaybackState('playing')
      sync()
    })
    this.el.addEventListener('pause', () => {
      setPlaybackState('paused')
      sync()
    })
    this.el.addEventListener('ended', () => clearPosition())

    registerMediaHandlers(this.handlers)
  }

  /** Resolves once the element can play the given src, or rejects. */
  private trySrc(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.el.removeEventListener('loadedmetadata', ok)
        this.el.removeEventListener('canplay', ok)
        this.el.removeEventListener('error', bad)
        clearTimeout(timer)
      }
      const ok = () => {
        cleanup()
        resolve()
      }
      const bad = () => {
        cleanup()
        reject(new Error(this.describeError()))
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('timed out reaching the audio host'))
      }, 15000)

      this.el.addEventListener('loadedmetadata', ok)
      this.el.addEventListener('canplay', ok)
      this.el.addEventListener('error', bad)
      // Assigning src already starts the resource selection algorithm. An
      // explicit load() on top of it throws away everything buffered and
      // re-fetches, which on a two-hour surah costs the listener real data.
      this.el.src = src
    })
  }

  private describeError(): string {
    const e = this.el.error
    if (!e) return 'the audio could not be loaded'
    switch (e.code) {
      case 1:
        return 'loading was aborted'
      case 2:
        return 'the network dropped while loading'
      case 3:
        return 'the audio file could not be decoded'
      case 4:
        return 'the host returned an error for this file'
      default:
        return 'the audio could not be loaded'
    }
  }

  async load(
    reciterId: string,
    surah: number,
    streamUrl: string | null,
    fallbackUrl: string | null = null,
    startAt = 0,
  ): Promise<LoadResult> {
    const saved = await getAudio(reciterId, surah)
    this.releaseObjectUrl()
    this.currentSurah = surah
    this.currentReciter = reciterId
    this.lastSaved = startAt

    const candidates: Array<{ src: string; mode: PlaybackMode }> = []
    if (saved) {
      this.objectUrl = URL.createObjectURL(saved)
      candidates.push({ src: this.objectUrl, mode: 'offline' })
    }
    if (streamUrl) candidates.push({ src: streamUrl, mode: 'streaming' })
    if (fallbackUrl && fallbackUrl !== streamUrl) {
      candidates.push({ src: fallbackUrl, mode: 'streaming' })
    }

    if (!candidates.length) {
      return { ok: false, reason: 'this surah has not been recorded yet' }
    }

    let last = 'the audio could not be loaded'
    for (const c of candidates) {
      try {
        await this.trySrc(c.src)
        this.mode = c.mode
        if (startAt > 0) {
          try {
            this.el.currentTime = startAt
          } catch {
            /* not seekable yet — start from the beginning */
          }
        }
        return { ok: true, mode: c.mode }
      } catch (e) {
        last = e instanceof Error ? e.message : String(e)
      }
    }

    this.onError?.(last)
    return { ok: false, reason: last }
  }

  private releaseObjectUrl() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }

  async play() {
    try {
      await this.el.play()
      return true
    } catch (e) {
      // Autoplay policy, or the source failed. Surface it rather than
      // leaving a play button that silently does nothing.
      this.onError?.(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'tap play again to start audio'
          : this.describeError(),
      )
      return false
    }
  }

  pause() {
    this.el.pause()
  }

  seek(seconds: number, fast = false) {
    try {
      // fastSeek lets the browser land on the nearest keyframe rather than
      // decoding to an exact offset, which is what keeps a lock-screen drag
      // responsive on a two-hour file.
      if (fast && typeof this.el.fastSeek === 'function') this.el.fastSeek(seconds)
      else this.el.currentTime = seconds
    } catch {
      /* not seekable yet */
    }
  }

  setRate(rate: number) {
    this.rate = rate
    // Both, deliberately: defaultPlaybackRate is what a resource load restores
    // playbackRate from, so setting only the latter loses the setting on the
    // next surah.
    this.el.defaultPlaybackRate = rate
    this.el.playbackRate = rate
  }

  /** Pause, and tell the OS the session is over rather than merely paused. */
  stop() {
    this.el.pause()
    clearPosition()
    setPlaybackState('none')
  }

  /**
   * Hand playback to a TV, speaker or car via AirPlay or Cast.
   *
   * Supported on Safari, Chrome and Chrome Android, and it costs about ten
   * lines because the browser owns the device picker. A native app would need
   * the Cast SDK, a receiver application, and AirPlay handled separately.
   *
   * The receiver fetches the URL itself, so a surah saved to this device
   * cannot be cast — the caller warns about that rather than failing quietly.
   */
  get remote(): RemotePlayback | null {
    return (this.el as HTMLMediaElement & { remote?: RemotePlayback }).remote ?? null
  }

  watchRemoteAvailability(fn: (available: boolean) => void): () => void {
    const r = this.remote
    if (!r?.watchAvailability) return () => {}
    let id: number | null = null
    r.watchAvailability((available) => fn(available))
      .then((watchId) => {
        id = watchId
      })
      .catch(() => {})
    return () => {
      if (id !== null) r.cancelWatchAvailability(id).catch(() => {})
    }
  }

  async promptRemote() {
    try {
      await this.remote?.prompt()
    } catch {
      // The picker was dismissed, or no device was chosen. Not an error.
    }
  }

  get surah() {
    return this.currentSurah
  }

  get duration() {
    return Number.isFinite(this.el.duration) ? this.el.duration : 0
  }
}
