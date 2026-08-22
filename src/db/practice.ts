import { getDB } from './index'

/**
 * Practice history: stumbles tapped during listening, and a per-page summary
 * of how review is going.
 *
 * There is deliberately no recitation checking here. A stumble is nothing
 * more than the user's own two-finger tap saying "I lost it here" — the app
 * has no way to judge recitation and does not try to.
 */
export type Stumble = {
  /** "surah:ayah:word", the same key the mushaf layout and timings use. */
  key: string
  surah: number
  page: number
  at: number // ms epoch
}

export type PageRecord = {
  page: number
  addedAt: number
  lastReviewed: number
  stumbles: number
  streak: number
  /** How many times the veil was lifted on this page. */
  peeks?: number
  /** Total time spent peeking, in ms. */
  peekMs?: number
}

// The word key alone is not unique in the store: tapping the same word twice
// on two different listens must keep both stumbles, since each is a real
// data point for the heat map, not a correction of the last one.
const stumbleRecordKey = (s: Stumble) => `${s.key}:${s.at}`

export async function addStumble(s: Stumble): Promise<void> {
  const db = await getDB()
  await db.put('stumbles', s, stumbleRecordKey(s))
}

export async function stumblesFor(surah: number): Promise<Stumble[]> {
  const db = await getDB()
  const all = (await db.getAll('stumbles')) as Stumble[]
  return all.filter((s) => s.surah === surah)
}

export async function stumbleCounts(): Promise<Map<number, number>> {
  const db = await getDB()
  // The heat map covers all 604 pages at once, so this reads the store once
  // and tallies in memory rather than running 604 separate range queries.
  const all = (await db.getAll('stumbles')) as Stumble[]
  const counts = new Map<number, number>()
  for (const s of all) counts.set(s.page, (counts.get(s.page) ?? 0) + 1)
  return counts
}

export async function clearStumbles(surah?: number): Promise<void> {
  const db = await getDB()
  if (surah === undefined) {
    await db.clear('stumbles')
    return
  }
  const tx = db.transaction('stumbles', 'readwrite')
  const store = tx.objectStore('stumbles')
  let cursor = await store.openCursor()
  while (cursor) {
    if ((cursor.value as Stumble).surah === surah) void cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

export async function getPageRecord(page: number): Promise<PageRecord | undefined> {
  const db = await getDB()
  return db.get('pages', page) as Promise<PageRecord | undefined>
}

export async function putPageRecord(rec: PageRecord): Promise<void> {
  const db = await getDB()
  await db.put('pages', rec, rec.page)
}

export async function allPageRecords(): Promise<PageRecord[]> {
  const db = await getDB()
  return (await db.getAll('pages')) as PageRecord[]
}

/**
 * Read the existing record and write the reviewed one back in a single
 * transaction. Two taps landing close together must not both read the same
 * stale streak and each write their own +1, which is what would happen if
 * the get and the put were separate round trips against the database.
 */
export async function markReviewed(
  page: number,
  stumbles: number,
  at: number,
): Promise<PageRecord> {
  const db = await getDB()
  const tx = db.transaction('pages', 'readwrite')
  const store = tx.objectStore('pages')
  const existing = (await store.get(page)) as PageRecord | undefined
  const next: PageRecord = {
    page,
    addedAt: existing?.addedAt ?? at,
    lastReviewed: at,
    stumbles,
    // A clean pass extends the streak; any stumble means the page was not
    // held cleanly, so the streak starts over rather than merely pausing.
    streak: stumbles > 0 ? 0 : (existing?.streak ?? 0) + 1,
  }
  void store.put(next, page)
  await tx.done
  return next
}

/**
 * Record that the veil was lifted on a page.
 *
 * How often you had to look is the most honest signal the app can collect
 * about whether a page is really held, and unlike a self-assessment it costs
 * nothing to give — you were going to peek anyway. It is counted silently
 * and never shown as a failure.
 *
 * Shares the pages store and its single-transaction discipline, because a
 * peek and a review can land in the same moment.
 */
export async function addPeek(page: number, ms: number, at: number): Promise<PageRecord> {
  const db = await getDB()
  const tx = db.transaction('pages', 'readwrite')
  const store = tx.objectStore('pages')
  const existing = (await store.get(page)) as PageRecord | undefined
  const next: PageRecord = {
    page,
    addedAt: existing?.addedAt ?? at,
    lastReviewed: existing?.lastReviewed ?? at,
    stumbles: existing?.stumbles ?? 0,
    streak: existing?.streak ?? 0,
    peeks: (existing?.peeks ?? 0) + 1,
    peekMs: (existing?.peekMs ?? 0) + Math.max(0, ms),
  }
  void store.put(next, page)
  await tx.done
  return next
}
