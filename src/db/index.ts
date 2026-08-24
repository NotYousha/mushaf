import { openDB, type IDBPDatabase } from 'idb'

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB('mushaf', 4, {
      upgrade(db) {
        // 'audio' predates chunked downloads. It is kept so surahs saved by
        // an earlier build keep playing rather than needing a re-download.
        if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio')
        if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs')
        // Partial and completed downloads: one manifest per surah, and its
        // chunks stored separately so an interruption costs one chunk.
        if (!db.objectStoreNames.contains('downloads')) db.createObjectStore('downloads')
        if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks')
        // Practice history, added in v3. 'stumbles' is a log rather than a
        // per-word counter because the same word can be tapped more than
        // once and every occurrence should count toward the heat map.
        // 'pages' is kept separate from 'stumbles' because it summarises
        // review outcomes (streaks) that outlive any individual stumble.
        if (!db.objectStoreNames.contains('stumbles')) db.createObjectStore('stumbles')
        if (!db.objectStoreNames.contains('pages')) db.createObjectStore('pages')
        // Portraits the listener supplied, one per imam, added in v4. Kept out
        // of 'prefs' because these are large binaries and prefs is read whole
        // on nearly every screen.
        if (!db.objectStoreNames.contains('faces')) db.createObjectStore('faces')
      },
    })
  }
  return dbPromise
}
