import { describe, it, expect, beforeEach } from 'vitest'
import { getDB } from '../src/db/index'
import {
  addStumble,
  stumblesFor,
  stumbleCounts,
  clearStumbles,
  getPageRecord,
  putPageRecord,
  allPageRecords,
  markReviewed,
} from '../src/db/practice'

describe('stumbles', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('stumbles')
  })

  it('round-trips a stumble', async () => {
    await addStumble({ key: '2:1:3', surah: 2, page: 5, at: 1000 })
    const found = await stumblesFor(2)
    expect(found).toEqual([{ key: '2:1:3', surah: 2, page: 5, at: 1000 }])
  })

  it('keeps two stumbles on the same word at different times', async () => {
    await addStumble({ key: '2:1:3', surah: 2, page: 5, at: 1000 })
    await addStumble({ key: '2:1:3', surah: 2, page: 5, at: 2000 })
    const found = await stumblesFor(2)
    expect(found).toHaveLength(2)
    expect(found.map((s) => s.at).sort()).toEqual([1000, 2000])
  })

  it('aggregates stumble counts by page in one pass', async () => {
    await addStumble({ key: '2:1:1', surah: 2, page: 5, at: 1 })
    await addStumble({ key: '2:1:2', surah: 2, page: 5, at: 2 })
    await addStumble({ key: '18:1:1', surah: 18, page: 293, at: 3 })
    const counts = await stumbleCounts()
    expect(counts.get(5)).toBe(2)
    expect(counts.get(293)).toBe(1)
    expect(counts.size).toBe(2)
  })

  it('clears only the given surah', async () => {
    await addStumble({ key: '2:1:1', surah: 2, page: 5, at: 1 })
    await addStumble({ key: '18:1:1', surah: 18, page: 293, at: 2 })
    await clearStumbles(2)
    expect(await stumblesFor(2)).toEqual([])
    expect(await stumblesFor(18)).toHaveLength(1)
  })

  it('clears everything when no surah is given', async () => {
    await addStumble({ key: '2:1:1', surah: 2, page: 5, at: 1 })
    await addStumble({ key: '18:1:1', surah: 18, page: 293, at: 2 })
    await clearStumbles()
    expect(await stumblesFor(2)).toEqual([])
    expect(await stumblesFor(18)).toEqual([])
  })
})

describe('page records', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('pages')
  })

  it('returns undefined for a page never reviewed', async () => {
    expect(await getPageRecord(1)).toBeUndefined()
  })

  it('round-trips a page record', async () => {
    await putPageRecord({ page: 1, addedAt: 100, lastReviewed: 100, stumbles: 0, streak: 1 })
    expect(await getPageRecord(1)).toEqual({
      page: 1,
      addedAt: 100,
      lastReviewed: 100,
      stumbles: 0,
      streak: 1,
    })
  })

  it('lists everything', async () => {
    await putPageRecord({ page: 1, addedAt: 1, lastReviewed: 1, stumbles: 0, streak: 1 })
    await putPageRecord({ page: 2, addedAt: 2, lastReviewed: 2, stumbles: 1, streak: 0 })
    const all = await allPageRecords()
    expect(all.map((r) => r.page).sort()).toEqual([1, 2])
  })

  it('creates a record on first review', async () => {
    const rec = await markReviewed(7, 0, 500)
    expect(rec).toEqual({ page: 7, addedAt: 500, lastReviewed: 500, stumbles: 0, streak: 1 })
  })

  it('increments the streak on a clean subsequent review', async () => {
    await markReviewed(7, 0, 500)
    const rec = await markReviewed(7, 0, 600)
    expect(rec).toEqual({ page: 7, addedAt: 500, lastReviewed: 600, stumbles: 0, streak: 2 })
  })

  it('resets the streak when the review had stumbles', async () => {
    await markReviewed(7, 0, 500)
    await markReviewed(7, 0, 600)
    const rec = await markReviewed(7, 2, 700)
    expect(rec).toEqual({ page: 7, addedAt: 500, lastReviewed: 700, stumbles: 2, streak: 0 })
  })

  it('keeps the original addedAt across updates', async () => {
    await markReviewed(7, 0, 500)
    const rec = await markReviewed(7, 0, 999)
    expect(rec.addedAt).toBe(500)
  })
})
