export type QueueState = {
  active: number[]
  pending: number[]
  progress: Record<number, number>
  failed: Record<number, string>
}

type Deps = {
  fetcher: (
    surah: number,
    url: string,
    onProgress: (loaded: number, total: number) => void,
    signal: AbortSignal,
  ) => Promise<Blob>
  save: (surah: number, blob: Blob) => Promise<void>
  concurrency?: number
}

export class DownloadQueue {
  private pending: Array<{ surah: number; url: string }> = []
  private active = new Map<number, AbortController>()
  private progress: Record<number, number> = {}
  private failed: Record<number, string> = {}
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
      pending: this.pending.map((p) => p.surah),
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

  enqueue(surah: number, url: string) {
    if (this.active.has(surah) || this.pending.some((p) => p.surah === surah)) return
    delete this.failed[surah]
    this.pending.push({ surah, url })
    this.pump()
  }

  cancel(surah: number) {
    this.active.get(surah)?.abort()
    this.pending = this.pending.filter((p) => p.surah !== surah)
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
      const ac = new AbortController()
      this.active.set(job.surah, ac)

      const task = (async () => {
        try {
          const blob = await this.deps.fetcher(
            job.surah,
            job.url,
            (loaded, total) => {
              this.progress[job.surah] = total ? loaded / total : 0
              this.emit()
            },
            ac.signal,
          )
          await this.deps.save(job.surah, blob)
        } catch (e: unknown) {
          // One surah failing must not stall the rest of the queue.
          this.failed[job.surah] = e instanceof Error ? e.message : String(e)
        } finally {
          this.active.delete(job.surah)
          delete this.progress[job.surah]
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
