import { segmentAt, type Segment } from '../mushaf/data'

/**
 * Talqeen Mode — the reciter reads a line, then leaves exactly that much
 * silence for you to recite it back, then carries on.
 *
 * This is how a halaqa teaches, and the whole point is that it works with the
 * screen off, so the silence is *not* produced by pausing. A paused audio
 * element lets the browser suspend the page, and on a locked phone the timer
 * that was supposed to resume playback never fires — the recitation would
 * simply stop. Instead the element plays continuously: at the end of a line it
 * seeks back to the start of that line and plays it again muted. The gap is
 * therefore exactly as long as the line took, by construction rather than by
 * arithmetic, and the audio session never drops.
 */

export type Phase = 'listen' | 'echo'

export type TalqeenState = {
  index: number
  phase: Phase
  segment: Segment | null
}

type Options = {
  el: HTMLMediaElement
  segments: Segment[]
  onState?: (s: TalqeenState) => void
  /** Called when the final line's turn is over and the surah is really done. */
  onFinished?: () => void
  /** Poll interval in ms. Tests inject a manual clock instead. */
  interval?: number
}

/**
 * How far past a line's end we accept as "still that line".
 *
 * Polling cannot land exactly on a boundary, and a seek takes time to settle.
 * Without this the controller can decide the line ended, seek back, and then
 * read a stale currentTime that is still past the end, cutting the echo short.
 */
const SETTLE = 0.25

export class Talqeen {
  private el: HTMLMediaElement
  private segments: Segment[]
  private onState?: (s: TalqeenState) => void
  private onFinished?: () => void
  private timer: ReturnType<typeof setInterval> | null = null
  private intervalMs: number
  /** Set while a seek we asked for has not landed yet. */
  private seeking = false
  /** True while replaying the last line after the audio already ended. */
  private finalEcho = false
  private onSeeked = () => {
    this.seeking = false
  }

  index = -1
  phase: Phase = 'listen'

  constructor({ el, segments, onState, onFinished, interval = 40 }: Options) {
    this.el = el
    this.segments = segments
    this.onState = onState
    this.onFinished = onFinished
    this.intervalMs = interval
  }

  get segment(): Segment | null {
    return this.segments[this.index] ?? null
  }

  private emit() {
    this.onState?.({ index: this.index, phase: this.phase, segment: this.segment })
  }

  start() {
    if (this.timer) return
    this.el.addEventListener('seeked', this.onSeeked)
    this.index = Math.max(0, segmentAt(this.segments, this.el.currentTime))
    this.phase = 'listen'
    this.el.muted = false
    this.emit()
    this.timer = setInterval(() => this.tick(), this.intervalMs)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.el.removeEventListener('seeked', this.onSeeked)
    // Leaving the element muted would silence ordinary playback too.
    this.el.muted = false
    this.phase = 'listen'
    this.finalEcho = false
    this.emit()
  }

  /**
   * The audio reached the end of the surah. The last line has been recited
   * but not yet echoed, and playback stops exactly on that boundary, so the
   * final line would otherwise be the one line that never gets its turn.
   *
   * Returns true when Talqeen has taken the ending over, in which case the
   * app must not move on to the next surah yet.
   */
  handleEnded(): boolean {
    if (!this.timer || this.phase !== 'listen') return false
    const seg = this.segment
    if (!seg) return false
    this.phase = 'echo'
    this.finalEcho = true
    this.el.muted = true
    this.seek(seg.start)
    void this.el.play()
    this.emit()
    return true
  }

  /** Called by the app when the listener scrubs, so we resume on their line. */
  resync() {
    const i = segmentAt(this.segments, this.el.currentTime)
    if (i < 0 || i === this.index) return
    this.index = i
    this.phase = 'listen'
    this.el.muted = false
    this.emit()
  }

  /** Skip the rest of your turn and hear the next line now. */
  skipEcho() {
    if (this.phase !== 'echo') return
    const seg = this.segment
    if (!seg) return
    this.phase = 'listen'
    this.el.muted = false
    this.index += 1
    this.seek(seg.end)
    this.emit()
  }

  /** Hear the current line again instead of reciting it. */
  repeat() {
    const seg = this.segment
    if (!seg) return
    this.phase = 'listen'
    this.el.muted = false
    this.seek(seg.start)
    this.emit()
  }

  private seek(to: number) {
    this.seeking = true
    this.el.currentTime = to
  }

  tick() {
    if (this.seeking) return
    const seg = this.segment
    if (!seg) return
    const now = this.el.currentTime

    // A jump the controller did not make — the listener scrubbed, or playback
    // ran into the next line while we were not looking.
    if (now < seg.start - SETTLE || now > seg.end + SETTLE) {
      this.resync()
      return
    }

    if (now < seg.end) return

    if (this.phase === 'listen') {
      // Your turn: the same line plays again, silently, so the gap lasts
      // exactly as long as the reciter took.
      this.phase = 'echo'
      this.el.muted = true
      this.seek(seg.start)
      this.emit()
      return
    }

    // The silent replay reached the end of the line, so the turn is over and
    // playback carries on into the next line by itself.
    this.phase = 'listen'
    this.el.muted = false
    if (this.finalEcho) {
      // There is no next line: this was the surah's ending, replayed so the
      // last line got its turn. Now the surah really is finished.
      this.finalEcho = false
      this.el.pause()
      this.emit()
      this.onFinished?.()
      return
    }
    this.index += 1
    this.emit()
  }
}
