import { openDB, type IDBPDatabase } from 'idb'

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB('mushaf', 2, {
      upgrade(db) {
        // 'audio' predates chunked downloads. It is kept so surahs saved by
        // an earlier build keep playing rather than needing a re-download.
        if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio')
        if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs')
        // Partial and completed downloads: one manifest per surah, and its
        // chunks stored separately so an interruption costs one chunk.
        if (!db.objectStoreNames.contains('downloads')) db.createObjectStore('downloads')
        if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks')
      },
    })
  }
  return dbPromise
}
