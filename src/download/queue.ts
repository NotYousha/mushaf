export type Job = { reciterId: string; surah: number; url: string }

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

export class DownloadQueue {
  private pending: Job[] = []
  private active = new Map<string, AbortController>()
  private progress: Record<string, number> = {}
  private failed: Record<string, string> = {}
  private paused = false
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

  private pump() {
    while (!this.paused && this.active.size < this.limit && this.pending.length) {
      const job = this.pending.shift()!
      const key = jobKey(job.reciterId, job.surah)
      const ac = new AbortController()
      this.active.set(key, ac)

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
          // One surah failing must not stall the rest of the queue.
          this.failed[key] = e instanceof Error ? e.message : String(e)
        } finally {
          this.active.delete(key)
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
