import bundled from '../../data/catalog.json'
import meta from '../../data/surahs.json'
import type { Catalog, Reciter, SurahMeta, SurahView } from './types'
import { mosqueReciters } from './mosques'

/** Deployment base, so audio shipped with the app resolves from a subpath. */
const BASE = import.meta.env?.BASE_URL ?? '/'

const catalog = bundled as unknown as Catalog

/**
 * The four individual mushafs, then every published year of both mosques.
 *
 * The years are expanded from a folded-up file rather than stored here — see
 * src/catalog/mosques.ts for why — but from this point on they are ordinary
 * reciters and nothing downstream treats them differently.
 */
const allReciters = (): Reciter[] => [...catalog.reciters, ...mosqueReciters()]

export function getReciters(): Reciter[] {
  return allReciters()
}

export function buildView(reciter: Reciter, m: SurahMeta[]): SurahView[] {
  const byNum = new Map(reciter.surahs.map((s) => [s.surah, s]))
  return m.map((md) => {
    const e = byNum.get(md.surah)
    return {
      surah: md.surah,
      name: md.name,
      nameEn: md.nameEn,
      // Note: `name` above comes from the surah metadata, not from the
      // catalog entry — the entry never carried a usable one.
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
      voice: e?.voice ?? null,
      voiceEn: e?.voiceEn ?? null,
      voicePhoto: e?.voicePhoto ?? null,
      voiceId: e?.voiceId ?? null,
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
 *
 * The remote manifest only ever describes the individual mushafs. The mosque
 * years are finished recordings that cannot grow, so they are appended
 * locally in every branch rather than being carried over the wire — otherwise
 * a successful refresh would silently drop all thirty-three of them.
 */
export async function loadCatalog(remoteUrl?: string): Promise<Reciter[]> {
  if (!remoteUrl) return allReciters()
  try {
    const res = await fetch(remoteUrl, { cache: 'no-cache' })
    if (!res.ok) return allReciters()
    const remote = (await res.json()) as Catalog
    if (!Array.isArray(remote.reciters) || !remote.reciters.length) {
      return allReciters()
    }
    const ok = catalog.reciters.every((local) => {
      const r = remote.reciters.find((x) => x.id === local.id)
      return r && Array.isArray(r.surahs) && r.surahs.length >= local.surahs.length
    })
    return ok ? [...remote.reciters, ...mosqueReciters()] : allReciters()
  } catch {
    // Offline or unreachable. The bundled catalog stands.
    return allReciters()
  }
}

export const surahMeta = meta as SurahMeta[]
