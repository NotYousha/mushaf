import bundled from '../../data/catalog.json'
import meta from '../../data/surahs.json'
import type { Catalog, Reciter, SurahMeta, SurahView } from './types'

/** Deployment base, so audio shipped with the app resolves from a subpath. */
const BASE = import.meta.env?.BASE_URL ?? '/'

const catalog = bundled as unknown as Catalog

export function getReciters(): Reciter[] {
  return catalog.reciters
}

export function buildView(reciter: Reciter, m: SurahMeta[]): SurahView[] {
  const byNum = new Map(reciter.surahs.map((s) => [s.surah, s]))
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
      // A catalog entry may hold a relative path for audio shipped with the
      // app; resolve it against the deployment base so it survives being
      // served from a subpath.
      url: e?.url ? (/^https?:\/\//.test(e.url) ? e.url : `${BASE}${e.url}`) : null,
      fallbackUrl: e?.fallbackUrl ?? null,
      bytes: e?.bytes ?? 0,
    }
  })
}

/**
 * Bundled catalog first, then try a remote refresh.
 *
 * Al-Dosari's mushaf is still being recorded, so his surah list grows over
 * time. A remote manifest lets newly aired surahs appear without shipping a
 * new build. A remote copy is only accepted when every reciter it carries is
 * a superset of the bundled one — a truncated or corrupt response must never
 * remove surahs the user can already see.
 */
export async function loadCatalog(remoteUrl?: string): Promise<Reciter[]> {
  if (!remoteUrl) return catalog.reciters
  try {
    const res = await fetch(remoteUrl, { cache: 'no-cache' })
    if (!res.ok) return catalog.reciters
    const remote = (await res.json()) as Catalog
    if (!Array.isArray(remote.reciters) || !remote.reciters.length) {
      return catalog.reciters
    }
    const ok = catalog.reciters.every((local) => {
      const r = remote.reciters.find((x) => x.id === local.id)
      return r && Array.isArray(r.surahs) && r.surahs.length >= local.surahs.length
    })
    return ok ? remote.reciters : catalog.reciters
  } catch {
    // Offline or unreachable. The bundled catalog stands.
    return catalog.reciters
  }
}

export const surahMeta = meta as SurahMeta[]
