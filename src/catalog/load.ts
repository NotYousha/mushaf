import bundled from '../../data/catalog.json'
import meta from '../../data/surahs.json'
import type { Catalog, SurahMeta, SurahView } from './types'

export function buildView(cat: Catalog, m: SurahMeta[]): SurahView[] {
  const byNum = new Map(cat.surahs.map((s) => [s.surah, s]))
  return m.map((md) => {
    const e = byNum.get(md.surah)
    return {
      surah: md.surah,
      name: md.name,
      nameEn: md.nameEn,
      translation: md.translation,
      ayahs: md.ayahs,
      released: !!e,
      verified: e?.verified ?? false,
      url: e?.url ?? null,
      bytes: e?.bytes ?? 0,
    }
  })
}

/**
 * Bundled catalog first, then try a remote refresh.
 *
 * The mushaf is still being recorded, so the catalog grows over time. A remote
 * manifest lets newly aired surahs appear without shipping a new build. A
 * remote copy is only accepted when it is a superset — a truncated or corrupt
 * response must never remove surahs the user can already see.
 */
export async function loadCatalog(remoteUrl?: string): Promise<SurahView[]> {
  let cat = bundled as unknown as Catalog
  if (remoteUrl) {
    try {
      const res = await fetch(remoteUrl, { cache: 'no-cache' })
      if (res.ok) {
        const remote = (await res.json()) as Catalog
        if (Array.isArray(remote.surahs) && remote.surahs.length >= cat.surahs.length) {
          cat = remote
        }
      }
    } catch {
      // Offline or unreachable. The bundled catalog stands.
    }
  }
  return buildView(cat, meta as SurahMeta[])
}

export const catalogInfo = {
  reciter: (bundled as unknown as Catalog).reciter,
  mushaf: (bundled as unknown as Catalog).mushaf,
}
