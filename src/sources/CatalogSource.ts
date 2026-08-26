import { downloadChunked } from '../download/chunked'
import type { AudioSource } from './AudioSource'

/** Origins measured to omit Access-Control-Allow-Origin. */
const BLOCKED_HOSTS = ['media.altilawat.com', 'digitaloceanspaces.com']

export class CatalogSource implements AudioSource {
  id = 'catalog'
  name = 'المصحف المرتل'

  constructor(
    private reciterId: string,
    private urls: Map<number, string>,
  ) {}

  async fetchSurah(
    surah: number,
    onProgress: (loaded: number, total: number) => void,
    signal: AbortSignal,
    /** What the catalog says this surah weighs; see ChunkedOpts.totalBytes. */
    totalBytes?: number,
  ): Promise<Blob> {
    const url = this.urls.get(surah)
    if (!url) throw new Error(`Surah ${surah} is not released yet`)

    // Hosts verified to send no Access-Control-Allow-Origin. A browser fetch
    // to one of these fails as an opaque network error that is near-impossible
    // to diagnose from a bug report, so refuse it loudly instead.
    //
    // This is a denylist, not an allowlist: it used to permit only
    // archive.org, which then rejected every URL once audio moved behind the
    // CORS proxy — the guard blocking the very host that fixed the problem.
    if (BLOCKED_HOSTS.some((h) => url.includes(h))) {
      throw new Error(`Refusing CORS-blocked host: ${url}`)
    }

    // Chunks are persisted as they arrive, so this both fetches and stores.
    return downloadChunked(this.reciterId, surah, url, { onProgress, signal, totalBytes })
  }
}
