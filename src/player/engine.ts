import { getAudio } from '../db/audio'
import { savePosition } from '../db/prefs'

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
  private lastSaved = 0
  mode: PlaybackMode = 'streaming'
  onError: ((message: string) => void) | null = null

  constructor() {
    this.el = new Audio()
    this.el.preload = 'metadata'

    this.el.addEventListener('timeupdate', () => {
      const t = this.el.currentTime
      if (this.currentSurah !== null && Math.abs(t - this.lastSaved) > 5) {
        this.lastSaved = t
        void savePosition(this.currentSurah, t)
      }
    })

    const flush = () => {
      if (this.currentSurah !== null) {
        void savePosition(this.currentSurah, this.el.currentTime)
      }
    }
    this.el.addEventListener('pause', flush)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', flush)
    }
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
      this.el.src = src
      this.el.load()
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
    surah: number,
    streamUrl: string | null,
    fallbackUrl: string | null = null,
    startAt = 0,
  ): Promise<LoadResult> {
    const saved = await getAudio(surah)
    this.releaseObjectUrl()
    this.currentSurah = surah
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

  seek(seconds: number) {
    try {
      this.el.currentTime = seconds
    } catch {
      /* not seekable yet */
    }
  }

  setRate(rate: number) {
    this.el.playbackRate = rate
  }

  get surah() {
    return this.currentSurah
  }

  get duration() {
    return Number.isFinite(this.el.duration) ? this.el.duration : 0
  }
}
