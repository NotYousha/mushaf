export type Job = {
  reciterId: string
  surah: number
  url: string
  /** Known size, used to decide whether to run this one on its own. */
  bytes?: number
}

export type QueueState = {
  /** Composite `reciterId:surah` keys, so two reciters never collide. */
  active: string[]
  pending: string[]
  progress: Record<string, number>
  failed: Record<string, string>
}

type Deps = {
  fetcher: (
    job: Job,
    onProgress: (loaded: number, total: number) => void,
    signal: AbortSignal,
  ) => Promise<Blob>
  save: (job: Job, blob: Blob) => Promise<void>
  concurrency?: number
}

export const jobKey = (reciterId: string, surah: number) => `${reciterId}:${surah}`

/**
 * Above this, downloads run one at a time.
 *
 * Three 200 MB files over a slow link means three things stuck at 30% and
 * nothing playable. Serialised, the listener has a usable surah in a third of
 * the time. Short surahs still run three abreast.
 */
const LARGE_FILE_BYTES = 50 * 1024 * 1024

export class DownloadQueue {
  private pending: Job[] = []
  private active = new Map<string, AbortController>()
  private activeJobs = new Map<string, Job>()
  private progress: Record<string, number> = {}
  private failed: Record<string, string> = {}
  private paused = false
  outOfSpace = false
  private subs = new Set<(s: QueueState) => void>()
  private running: Promise<void>[] = []
  private limit: number

  constructor(private deps: Deps) {
    this.limit = deps.concurrency ?? 3
  }

  state(): QueueState {
    return {
      active: [...this.active.keys()],
      pending: this.pending.map((j) => jobKey(j.reciterId, j.surah)),
      progress: { ...this.progress },
      failed: { ...this.failed },
    }
  }

  subscribe(fn: (s: QueueState) => void) {
    this.subs.add(fn)
    return () => {
      this.subs.delete(fn)
    }
  }

  private emit() {
    const s = this.state()
    this.subs.forEach((f) => f(s))
  }

  /**
   * The job carries its own reciter and URL. Resolving either at run time
   * from whatever the UI currently shows would download the wrong audio when
   * the reciter is switched while a download is queued.
   */
  enqueue(job: Job) {
    const key = jobKey(job.reciterId, job.surah)
    if (this.active.has(key) || this.pending.some((j) => jobKey(j.reciterId, j.surah) === key)) {
      return
    }
    delete this.failed[key]
    // Asking for a download again means the listener has dealt with the full
    // disk. Leaving the flag set would keep showing the warning forever.
    this.outOfSpace = false
    this.pending.push(job)
    this.pump()
  }

  cancel(reciterId: string, surah: number) {
    const key = jobKey(reciterId, surah)
    this.active.get(key)?.abort()
    this.pending = this.pending.filter((j) => jobKey(j.reciterId, j.surah) !== key)
    this.emit()
  }

  pauseAll() {
    this.paused = true
    this.active.forEach((c) => c.abort())
  }

  resumeAll() {
    this.paused = false
    this.pump()
  }

  /** One at a time while anything large is in flight or waiting. */
  private currentLimit() {
    const large = [...this.activeJobs.values(), ...this.pending].some(
      (j) => (j.bytes ?? 0) >= LARGE_FILE_BYTES,
    )
    return large ? 1 : this.limit
  }

  private pump() {
    while (!this.paused && this.active.size < this.currentLimit() && this.pending.length) {
      const job = this.pending.shift()!
      const key = jobKey(job.reciterId, job.surah)
      const ac = new AbortController()
      this.active.set(key, ac)
      this.activeJobs.set(key, job)

      const task = (async () => {
        try {
          const blob = await this.deps.fetcher(
            job,
            (loaded, total) => {
              this.progress[key] = total ? loaded / total : 0
              this.emit()
            },
            ac.signal,
          )
          await this.deps.save(job, blob)
        } catch (e: unknown) {
          // Running out of space is not this surah's problem — every queued
          // download will hit it too, so stop rather than failing 113 times.
          if ((e as { name?: string })?.name === 'OutOfSpaceError') {
            this.pending = []
            // The flag speaks for the whole queue. Filing the same error
            // against one arbitrary surah as well would leave a stale
            // "out of space" beside it after the listener frees room.
            this.outOfSpace = true
          } else if ((e as { name?: string })?.name === 'AbortError') {
            // Cancelling is not a failure. Filing it as one left "could not
            // save: the user aborted a request" on screen permanently — the
            // failed map is only ever cleared by re-enqueueing that exact
            // surah, so it re-asserted itself on every later queue event and
            // stomped whatever the app was actually trying to say.
          } else {
            // One surah failing must not stall the rest of the queue.
            this.failed[key] = e instanceof Error ? e.message : String(e)
          }
        } finally {
          this.active.delete(key)
          this.activeJobs.delete(key)
          delete this.progress[key]
          this.emit()
          this.pump()
        }
      })()

      this.running.push(task)
    }
    this.emit()
  }

  async drain() {
    while (this.running.length) {
      const batch = this.running
      this.running = []
      await Promise.all(batch)
    }
  }
}
