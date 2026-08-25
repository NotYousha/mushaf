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
  /**
   * The next surah's source, resolved before the current one ends.
   *
   * Following on has to be synchronous. `load` asks IndexedDB whether a
   * saved copy exists, and an await is a return to the event loop -- which on
   * a locked phone is the one moment iOS is free to suspend the page, because
   * no audio is playing any more. The surah ended, the app went to sleep
   * reaching for the next one, and playback simply stopped.
   *
   * So the work is done while sound is still coming out, and what is left at
   * the end is assigning a src and calling play with nothing awaited between.
   */
  private pending: {
    reciterId: string
    surah: number
    src: string
    mode: PlaybackMode
    objectUrl: string | null
  } | null = null

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
    this.el.addEventListener('ended', () => {
      // Only when this really is the end. Clearing the position state tells
      // the system the session is over, and saying that between two surahs
      // takes the lock screen down for the gap and can end the audio session
      // outright — which is exactly when it must not.
      if (!this.pending) clearPosition()
    })

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
    this.discardPending()
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

  /**
   * Resolve the surah that comes next, without disturbing what is playing.
   *
   * Safe to call repeatedly; the last answer wins. The object URL it may
   * create is owned by the pending entry and released with it, so an
   * abandoned preparation cannot leak one.
   */
  async prepareNext(
    reciterId: string,
    surah: number,
    streamUrl: string | null,
    fallbackUrl: string | null = null,
  ): Promise<boolean> {
    if (this.pending?.reciterId === reciterId && this.pending.surah === surah) return true
    const saved = await getAudio(reciterId, surah)
    const src = saved ? URL.createObjectURL(saved) : (streamUrl ?? fallbackUrl)
    if (!src) return false
    this.discardPending()
    this.pending = {
      reciterId,
      surah,
      src,
      mode: saved ? 'offline' : 'streaming',
      objectUrl: saved ? src : null,
    }
    return true
  }

  private discardPending() {
    if (this.pending?.objectUrl) URL.revokeObjectURL(this.pending.objectUrl)
    this.pending = null
  }

  /** What is queued up, so the caller can check its own bookkeeping agrees. */
  get preparedSurah(): number | null {
    return this.pending?.surah ?? null
  }

  /**
   * Start the prepared surah with nothing awaited first.
   *
   * Everything here is synchronous on purpose. This runs from the `ended`
   * handler, and any await before `play()` hands control back to the browser
   * at the one moment a backgrounded page is most likely to be suspended.
   */
  startPrepared(): number | null {
    const p = this.pending
    if (!p) return null
    this.pending = null
    this.releaseObjectUrl()
    this.objectUrl = p.objectUrl
    this.currentSurah = p.surah
    this.currentReciter = p.reciterId
    this.lastSaved = 0
    this.mode = p.mode
    this.el.src = p.src
    this.el.playbackRate = this.rate
    void this.el.play().catch(() => {
      // Refused, which on a locked phone means the session was already gone.
      // The caller's own path can try again when the app is looked at.
    })
    return p.surah
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
      /**
       * Register the handlers again, now that there is certainly a session.
       *
       * setActionHandler does two things: it stores the handler, and it tells
       * the system that this control exists. The second only happens if a
       * media session manager exists at that moment — WebKit logs "NULL
       * session manager" and skips it otherwise — and at page load, before a
       * note has been played, there is none.
       *
       * So the handlers registered in the constructor were stored but never
       * announced. Storing them is enough to make the browser hand us every
       * remote command instead of acting on them itself, and announcing them
       * is what makes the system draw the control at all. The lock screen
       * therefore had a scrubber it would not let anyone drag, and a seek
       * handler waiting for a command that was never going to come.
       *
       * The transport buttons escaped this only by accident: they are
       * re-registered after every surah starts, which is to say after a
       * session exists. This does the same for the rest of them, and play()
       * resolving is the moment that is guaranteed to be true.
       */
      registerMediaHandlers(this.handlers)
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

  /**
   * Move the playhead, and tell the system straight away that we did.
   *
   * The acknowledgement is the point. Dropping a scrubber on a lock screen
   * sends one command and then waits to see the elapsed time move; if it does
   * not, the system decides the app ignored it and puts the thumb back where
   * it was. Assigning currentTime fires `seeking`, which is exactly when this
   * code used to go quiet and wait for `seeked` — and on a ninety-megabyte
   * surah streamed over a phone connection, `seeked` is a whole range request
   * away, sometimes seconds. The command had been obeyed and the drag still
   * looked like it had failed.
   *
   * Setting currentTime updates the official playback position immediately,
   * before any data arrives, so there is a true answer to report at once and
   * no reason to make the system wait for the network to confirm it.
   */
  seek(seconds: number, fast = false) {
    try {
      // fastSeek lets the browser land on the nearest keyframe rather than
      // decoding to an exact offset, which is what keeps a lock-screen drag
      // responsive on a two-hour file.
      if (fast && typeof this.el.fastSeek === 'function') this.el.fastSeek(seconds)
      else this.el.currentTime = seconds
    } catch {
      /* not seekable yet */
      return
    }
    setPosition(this.el, true)
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
