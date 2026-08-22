/**
 * Pure scheduling core for hifz (memorisation) review.
 *
 * Nothing here touches React, IndexedDB, or the clock: every function takes
 * the current time as an argument instead of calling `Date.now()`, so the
 * same inputs always produce the same outputs and the whole module can be
 * tested without faking global state. The app also never decides what a
 * student has memorised -- a teacher does that -- so every record here is
 * something the caller told us, not something we inferred.
 */

export type Tier = 'sabaq' | 'sabqi' | 'manzil'

/** What the student has told us about one page. */
export type PageRecord = {
  page: number // 1..604
  addedAt: number // ms epoch, when it became sabaq
  lastReviewed: number // ms epoch
  /** Stumbles recorded on this page at the last review. */
  stumbles: number
  /** How many consecutive reviews were clean (0 stumbles). */
  streak: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * "Today" and "within 7 days" are judged by calendar-day buckets (whole
 * multiples of a day since the epoch) rather than a rolling 24h window, so a
 * page added at 11pm still counts as sabaq for the rest of that same day
 * instead of ageing into sabqi an hour later. That matches how a student
 * actually experiences it: the new lesson is "today's page" until the day
 * turns over, not until 24 hours have literally elapsed.
 */
const dayIndex = (ms: number) => Math.floor(ms / DAY_MS)

const SABQI_WINDOW_MS = 7 * DAY_MS

/**
 * sabaq while it's still the same calendar day it was added; sabqi for the
 * week after that, matching the traditional rule of thumb that recent
 * lessons stay in the fast daily rotation for about a week; manzil once a
 * page has survived that week and moves to the slower long-term rotation.
 */
export function tierOf(rec: PageRecord, now: number): Tier {
  if (dayIndex(rec.addedAt) === dayIndex(now)) return 'sabaq'
  if (now - rec.addedAt <= SABQI_WINDOW_MS) return 'sabqi'
  return 'manzil'
}

/**
 * Streak-earned interval, in days, before any tier floor is applied.
 * Spacing roughly doubles at first (1, 2, 4, 7 days) the way most spaced
 * repetition ladders do, then slows to two weeks and a month once a page has
 * survived several clean reviews in a row -- by then it is well-consolidated
 * and reviewing it more often would mean spending time on a page that
 * doesn't need it instead of one that does. The ladder stops at 30 days
 * rather than climbing further because a memorised Quran page decays faster
 * than a typical flashcard fact: once-a-month is already a long leash for a
 * page with no other tier keeping it fresh.
 */
const LADDER_DAYS = [1, 2, 4, 7, 14, 30]

function ladderIntervalMs(streak: number): number {
  const idx = Math.min(Math.max(streak, 0), LADDER_DAYS.length - 1)
  return LADDER_DAYS[idx] * DAY_MS
}

/**
 * The interval a page actually gets is the streak ladder, floored by what
 * its tier demands. A sabaq page is the day's new lesson and must come back
 * for more repetition the same day no matter how clean that first pass was,
 * so its interval is 0. A sabqi page is by definition part of the last
 * week's daily rotation, so its interval can never drift past one day even
 * if a long clean streak would otherwise earn it a longer break -- the
 * point of sabqi is that it is seen every day, full stop. Only once a page
 * has aged into manzil does the streak ladder get to run unconstrained.
 */
function reviewIntervalMs(rec: PageRecord): number {
  // The tier is judged as of the last review, not "now": nextDue has no
  // notion of the current time, and what matters for choosing the interval
  // is which tier the page belonged to when that review happened.
  const tier = tierOf(rec, rec.lastReviewed)
  if (tier === 'sabaq') return 0
  const ladder = ladderIntervalMs(rec.streak)
  return tier === 'sabqi' ? Math.min(ladder, DAY_MS) : ladder
}

/**
 * A small floor under the interval used only for scoring, never for
 * scheduling: a sabaq page has a true interval of 0 (it's due again the
 * moment it's put down), but dividing by zero would make "overdue" undefined
 * instead of simply "very urgent". An hour is short enough to still push
 * sabaq pages near the top of the queue without ever actually being used as
 * a real due date.
 */
const MIN_SCORING_INTERVAL_MS = DAY_MS / 24

/**
 * Higher means more urgent to review right now. Two independent signals feed
 * this: how overdue the page is relative to what its own tier expects (a
 * sabqi page a day late is far more urgent than a manzil page a day late,
 * because sabqi is meant to be seen daily), and how shaky the last
 * recitation was (fresh stumbles and a short clean streak both mean the
 * page needs eyes on it sooner than the calendar alone suggests). The two
 * signals are added rather than multiplied so a rock-solid page that is only
 * a little overdue is never buried under a shaky page that isn't due yet --
 * lateness and shakiness both count, but neither should be able to cancel
 * the other out to zero.
 */
export function dueScore(rec: PageRecord, now: number): number {
  const interval = Math.max(reviewIntervalMs(rec), MIN_SCORING_INTERVAL_MS)
  const overdueRatio = (now - rec.lastReviewed) / interval
  const shakiness = rec.stumbles * 0.5 + 1 / (rec.streak + 1)
  return overdueRatio + shakiness
}

/** The ms-epoch time this page should next be reviewed. */
export function nextDue(rec: PageRecord): number {
  return rec.lastReviewed + reviewIntervalMs(rec)
}

/** Everything whose `nextDue` has passed, most urgent first. */
export function dueToday(records: PageRecord[], now: number): PageRecord[] {
  return records
    .filter((r) => nextDue(r) <= now)
    .sort((a, b) => dueScore(b, now) - dueScore(a, now))
}

/**
 * Records a review as a new object rather than mutating `rec`, so callers
 * that hold the old record (e.g. a React list mid-render) never see it
 * change out from under them. A clean review (no stumbles) extends the
 * streak by one; any stumble resets it to zero, because a shaky pass means
 * the page has not actually earned the longer interval the streak implies.
 */
export function review(rec: PageRecord, stumbles: number, at: number): PageRecord {
  return {
    ...rec,
    lastReviewed: at,
    stumbles,
    streak: stumbles > 0 ? 0 : rec.streak + 1,
  }
}

const TOTAL_PAGES = 604

export type WirdPlan = 'seven' | 'thirty' | 'ramadan'
export type WirdDay = { day: number; fromPage: number; toPage: number }

/**
 * Splits the 604 pages of the mushaf into `days` contiguous, non-empty
 * chunks that differ in length by at most one page. Distributing the
 * remainder across the first days (rather than, say, padding the last day)
 * means no day is conspicuously shorter or longer than its neighbours,
 * which is the property "a juz a night" style plans actually promise.
 */
export function wirdSchedule(plan: WirdPlan, totalDays?: number): WirdDay[] {
  const days = plan === 'seven' ? 7 : plan === 'thirty' ? 30 : (totalDays ?? 30)
  if (!Number.isInteger(days) || days < 1 || days > TOTAL_PAGES) {
    throw new Error(`wirdSchedule: totalDays must be between 1 and ${TOTAL_PAGES}, got ${days}`)
  }
  const base = Math.floor(TOTAL_PAGES / days)
  const remainder = TOTAL_PAGES % days
  const out: WirdDay[] = []
  let page = 1
  for (let d = 1; d <= days; d++) {
    const length = base + (d <= remainder ? 1 : 0)
    out.push({ day: d, fromPage: page, toPage: page + length - 1 })
    page += length
  }
  return out
}

/**
 * Where the student stands in a wird plan, expressed as debt rather than a
 * streak: given how many pages they have actually read, this walks the
 * schedule to find the first day whose cumulative target their reading has
 * reached, and reports how many pages short of that day's target they still
 * are. Using "reached" (`<=`, not `<`) matters at the boundary: a student who
 * has read exactly through day 5's target is credited with day 5 and owes
 * nothing yet, rather than being immediately charged the whole of day 6
 * before they have had a chance to start it. No calendar date is needed
 * because the debt is a fact about pages read versus pages assigned, not
 * about what today happens to be. A student who is exactly on pace or ahead
 * owes nothing, never a negative number.
 */
export function wirdProgress(
  schedule: WirdDay[],
  pagesRead: number,
): { day: number; pagesOwed: number } {
  let cumulative = 0
  for (const d of schedule) {
    cumulative += d.toPage - d.fromPage + 1
    if (pagesRead <= cumulative) {
      return { day: d.day, pagesOwed: cumulative - pagesRead }
    }
  }
  const last = schedule[schedule.length - 1]
  return { day: last.day, pagesOwed: 0 }
}
