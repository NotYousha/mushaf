import { getDB } from './index'

const POSITION_KEY = 'lastPosition'

export async function savePosition(surah: number, seconds: number) {
  const db = await getDB()
  await db.put('prefs', { surah, seconds }, POSITION_KEY)
}

export async function loadPosition(): Promise<{ surah: number; seconds: number } | null> {
  const db = await getDB()
  return (await db.get('prefs', POSITION_KEY)) ?? null
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
