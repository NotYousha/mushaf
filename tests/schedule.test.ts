import { describe, it, expect } from 'vitest'
import {
  tierOf,
  dueScore,
  nextDue,
  dueToday,
  review,
  wirdSchedule,
  wirdProgress,
  type PageRecord,
} from '../src/hifz/schedule'

const DAY_MS = 24 * 60 * 60 * 1000
const BASE = Date.UTC(2026, 0, 10) // a fixed, arbitrary UTC midnight

const rec = (over: Partial<PageRecord>): PageRecord => ({
  page: 1,
  addedAt: BASE,
  lastReviewed: BASE,
  stumbles: 0,
  streak: 0,
  ...over,
})

describe('tierOf', () => {
  it('is sabaq for a page added earlier the same calendar day', () => {
    expect(tierOf(rec({ addedAt: BASE }), BASE + 3 * 60 * 60 * 1000)).toBe('sabaq')
  })

  it('is sabqi once the calendar day has turned over but within a week', () => {
    expect(tierOf(rec({ addedAt: BASE }), BASE + 3 * DAY_MS)).toBe('sabqi')
  })

  it('stays sabqi at exactly the 7 day boundary', () => {
    expect(tierOf(rec({ addedAt: BASE }), BASE + 7 * DAY_MS)).toBe('sabqi')
  })

  it('becomes manzil once more than 7 days have passed', () => {
    expect(tierOf(rec({ addedAt: BASE }), BASE + 8 * DAY_MS)).toBe('manzil')
  })
})

describe('nextDue', () => {
  it('is due immediately for a same-day sabaq page regardless of streak', () => {
    const r = rec({ addedAt: BASE, lastReviewed: BASE, streak: 5 })
    expect(nextDue(r)).toBe(BASE)
  })

  it('floors sabqi pages at a one day interval even with a long streak', () => {
    const r = rec({ addedAt: BASE, lastReviewed: BASE + 2 * DAY_MS, streak: 20 })
    // still sabqi: added 2 days before its last review, well inside the week
    expect(nextDue(r)).toBe(r.lastReviewed + DAY_MS)
  })

  it('climbs the streak ladder once a page is manzil', () => {
    const ladderDays = [1, 2, 4, 7, 14, 30]
    for (const [streak, days] of ladderDays.entries()) {
      const r = rec({ addedAt: BASE, lastReviewed: BASE + 30 * DAY_MS, streak })
      expect(nextDue(r)).toBe(r.lastReviewed + days * DAY_MS)
    }
  })

  it('caps the ladder at 30 days for very long manzil streaks', () => {
    const r = rec({ addedAt: BASE, lastReviewed: BASE + 60 * DAY_MS, streak: 999 })
    expect(nextDue(r)).toBe(r.lastReviewed + 30 * DAY_MS)
  })
})

describe('dueScore', () => {
  it('ranks a shaky, overdue page above a clean, on-time one', () => {
    const now = BASE + 60 * DAY_MS
    const shaky = rec({
      addedAt: BASE,
      lastReviewed: now - 5 * DAY_MS,
      stumbles: 3,
      streak: 0,
    })
    const clean = rec({
      addedAt: BASE,
      lastReviewed: now - DAY_MS,
      stumbles: 0,
      streak: 5,
    })
    expect(dueScore(shaky, now)).toBeGreaterThan(dueScore(clean, now))
  })

  it('rises the longer a page sits unreviewed past its own interval', () => {
    const r = rec({ addedAt: BASE, lastReviewed: BASE + 30 * DAY_MS, streak: 3 })
    const soon = dueScore(r, r.lastReviewed + 8 * DAY_MS)
    const later = dueScore(r, r.lastReviewed + 20 * DAY_MS)
    expect(later).toBeGreaterThan(soon)
  })
})

describe('dueToday', () => {
  it('includes only pages whose next-due time has passed, most urgent first', () => {
    const now = BASE + 60 * DAY_MS
    const overdueShaky = rec({
      page: 1,
      addedAt: BASE,
      lastReviewed: now - 10 * DAY_MS,
      stumbles: 4,
      streak: 0,
    })
    const overdueMild = rec({
      page: 2,
      addedAt: BASE,
      lastReviewed: now - 2 * DAY_MS,
      stumbles: 0,
      streak: 0,
    })
    const notDue = rec({
      page: 3,
      addedAt: BASE,
      lastReviewed: now - DAY_MS,
      stumbles: 0,
      streak: 10,
    })
    const result = dueToday([notDue, overdueMild, overdueShaky], now)
    expect(result.map((r) => r.page)).toEqual([1, 2])
  })
})

describe('review', () => {
  it('never mutates the record it is given', () => {
    const original = rec({ stumbles: 2, streak: 0 })
    const frozen = { ...original }
    review(original, 0, BASE + DAY_MS)
    expect(original).toEqual(frozen)
  })

  it('extends the streak on a clean review', () => {
    const r = rec({ streak: 3, stumbles: 1 })
    const next = review(r, 0, BASE + DAY_MS)
    expect(next.streak).toBe(4)
    expect(next.stumbles).toBe(0)
    expect(next.lastReviewed).toBe(BASE + DAY_MS)
  })

  it('resets the streak to zero on any stumble', () => {
    const r = rec({ streak: 9, stumbles: 0 })
    const next = review(r, 2, BASE + DAY_MS)
    expect(next.streak).toBe(0)
    expect(next.stumbles).toBe(2)
  })
})

function assertFullContiguousCover(schedule: { fromPage: number; toPage: number }[]) {
  expect(schedule[0].fromPage).toBe(1)
  expect(schedule[schedule.length - 1].toPage).toBe(604)
  let expectedNext = 1
  for (const d of schedule) {
    expect(d.fromPage).toBe(expectedNext)
    expect(d.toPage).toBeGreaterThanOrEqual(d.fromPage)
    expectedNext = d.toPage + 1
  }
  expect(expectedNext).toBe(605)
}

describe('wirdSchedule', () => {
  it('covers all 604 pages with no gaps or overlaps for the seven manazil', () => {
    const s = wirdSchedule('seven')
    expect(s).toHaveLength(7)
    assertFullContiguousCover(s)
  })

  it('covers all 604 pages for a juz-a-night thirty day plan', () => {
    const s = wirdSchedule('thirty')
    expect(s).toHaveLength(30)
    assertFullContiguousCover(s)
  })

  it('defaults ramadan to thirty days but covers the same 604 pages', () => {
    const s = wirdSchedule('ramadan')
    expect(s).toHaveLength(30)
    assertFullContiguousCover(s)
  })

  it('lets ramadan be shortened to 29 days without losing or duplicating pages', () => {
    const s = wirdSchedule('ramadan', 29)
    expect(s).toHaveLength(29)
    assertFullContiguousCover(s)
  })

  it('keeps day lengths within one page of each other', () => {
    const s = wirdSchedule('seven')
    const lengths = s.map((d) => d.toPage - d.fromPage + 1)
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThanOrEqual(1)
  })
})

describe('wirdProgress', () => {
  const schedule = wirdSchedule('thirty')

  it('owes the full first day when nothing has been read yet', () => {
    const { day, pagesOwed } = wirdProgress(schedule, 0)
    expect(day).toBe(1)
    expect(pagesOwed).toBe(schedule[0].toPage - schedule[0].fromPage + 1)
  })

  it('owes nothing when reading is exactly caught up to a day boundary', () => {
    const throughDay5 = schedule[4].toPage
    const { pagesOwed } = wirdProgress(schedule, throughDay5)
    expect(pagesOwed).toBe(0)
  })

  it('never reports negative debt when the reader is ahead of pace', () => {
    const { pagesOwed } = wirdProgress(schedule, 604)
    expect(pagesOwed).toBeGreaterThanOrEqual(0)
    expect(pagesOwed).toBe(0)
  })

  it('reports partial debt mid-day when behind pace', () => {
    const target = schedule[9].toPage
    const { day, pagesOwed } = wirdProgress(schedule, target - 3)
    expect(day).toBe(10)
    expect(pagesOwed).toBe(3)
  })
})
