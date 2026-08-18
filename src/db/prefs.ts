import { getDB } from './index'

const POSITION_KEY = 'lastPosition'

export type Position = { reciterId: string; surah: number; seconds: number }

export async function savePosition(reciterId: string, surah: number, seconds: number) {
  const db = await getDB()
  await db.put('prefs', { reciterId, surah, seconds } as Position, POSITION_KEY)
}

export async function loadPosition(): Promise<Position | null> {
  const db = await getDB()
  const p = (await db.get('prefs', POSITION_KEY)) as Partial<Position> | undefined
  if (!p || typeof p.surah !== 'number') return null
  // Positions saved before multi-reciter carried no reciter id.
  return { reciterId: p.reciterId ?? 'dosari', surah: p.surah, seconds: p.seconds ?? 0 }
}

export async function setPref<T>(key: string, value: T) {
  const db = await getDB()
  await db.put('prefs', value, key)
}

export async function getPref<T>(key: string, fallback: T): Promise<T> {
  const db = await getDB()
  const v = await db.get('prefs', key)
  return (v ?? fallback) as T
}
