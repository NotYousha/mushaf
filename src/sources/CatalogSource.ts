import { downloadChunked } from '../download/chunked'
import type { AudioSource } from './AudioSource'

export class CatalogSource implements AudioSource {
  id = 'catalog'
  name = 'المصحف المرتل'

  constructor(private urls: Map<number, string>) {}

  async fetchSurah(
    surah: number,
    onProgress: (loaded: number, total: number) => void,
    signal: AbortSignal,
  ): Promise<Blob> {
    const url = this.urls.get(surah)
    if (!url) throw new Error(`Surah ${surah} is not released yet`)

    // Only archive.org sends Access-Control-Allow-Origin. Any other host fails
    // as an opaque network error in the browser, which is near-impossible to
    // diagnose from a bug report — so refuse it loudly here instead.
    if (!/(^|\.)archive\.org\//.test(url)) {
      throw new Error(`Refusing CORS-blocked host: ${url}`)
    }

    return downloadChunked(url, { onProgress, signal })
  }
}
