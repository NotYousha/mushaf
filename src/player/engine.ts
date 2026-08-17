import { getAudio } from '../db/audio'
import { savePosition } from '../db/prefs'

export type PlaybackMode = 'offline' | 'streaming'

/**
 * Streaming-first playback.
 *
 * A downloaded surah plays from its IndexedDB blob. Anything else streams
 * straight from the catalog URL — archive.org honours range requests, so the
 * browser seeks without pulling the whole file. Downloading is therefore
 * entirely opt-in, and the app stays a few MB rather than gigabytes.
 */
export class PlayerEngine {
  readonly el: HTMLAudioElement
  private objectUrl: string | null = null
  private currentSurah: number | null = null
  private lastSaved = 0
  mode: PlaybackMode = 'streaming'

  constructor() {
    this.el = new Audio()
    this.el.preload = 'metadata'
    this.el.crossOrigin = 'anonymous'

    this.el.addEventListener('timeupdate', () => {
      const t = this.el.currentTime
      // Throttled — writing every timeupdate would hammer IndexedDB.
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

  /**
   * Prefers a downloaded copy, falls back to streaming.
   * Returns null when the surah is neither downloaded nor streamable.
   */
  async load(
    surah: number,
    streamUrl: string | null,
    startAt = 0,
  ): Promise<PlaybackMode | null> {
    const blob = await getAudio(surah)

    this.releaseObjectUrl()

    let src: string
    if (blob) {
      this.objectUrl = URL.createObjectURL(blob)
      src = this.objectUrl
      this.mode = 'offline'
    } else if (streamUrl) {
      src = streamUrl
      this.mode = 'streaming'
    } else {
      return null
    }

    this.currentSurah = surah
    this.lastSaved = startAt
    this.el.src = src

    if (startAt > 0) {
      await new Promise<void>((resolve) => {
        const onReady = () => {
          this.el.removeEventListener('loadedmetadata', onReady)
          resolve()
        }
        this.el.addEventListener('loadedmetadata', onReady)
        // Streaming metadata can stall on a bad connection; do not hang forever.
        setTimeout(resolve, 4000)
      })
      try {
        this.el.currentTime = startAt
      } catch {
        // Seeking before the stream is seekable is not fatal.
      }
    }

    return this.mode
  }

  private releaseObjectUrl() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }

  play() {
    return this.el.play()
  }

  pause() {
    this.el.pause()
  }

  seek(seconds: number) {
    try {
      this.el.currentTime = seconds
    } catch {
      // Not yet seekable.
    }
  }

  get surah() {
    return this.currentSurah
  }

  get duration() {
    return Number.isFinite(this.el.duration) ? this.el.duration : 0
  }
}
