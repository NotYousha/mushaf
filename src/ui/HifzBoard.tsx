import { useEffect, useMemo, useState } from 'react'
import type { Strings, Lang } from '../i18n'
import { digits } from '../i18n/script'
import {
  allPageRecords,
  markReviewed,
  stumbleCounts,
  type PageRecord,
} from '../db/practice'
import { getPref, setPref } from '../db/prefs'
import {
  dueToday,
  tierOf,
  wirdProgress,
  wirdSchedule,
  type Tier,
  type WirdPlan,
} from '../hifz/schedule'

const PAGES = 604

type Props = {
  t: Strings
  /**
   * Needed for the numerals, not for the words.
   *
   * The three tier counts were rendered straight from the numbers, so an
   * Arabic or Urdu reader got Latin 0, 1, 2 in the middle of a screen where
   * every other digit in the app is Arabic-Indic.
   */
  lang: Lang
  /** Open a mushaf page for review. */
  onOpenPage?: (page: number) => void
}

/**
 * How strongly a page is shaded on the map.
 *
 * Stumbles and peeks are the two things the reader actually told us, so they
 * drive the colour together; a page reviewed cleanly several times in a row
 * cools off. The scale tops out quickly on purpose — the map is meant to show
 * *where* the trouble is at a glance, not to rank degrees of trouble.
 */
function heat(rec: PageRecord | undefined, stumbles: number): number {
  if (!rec && !stumbles) return 0
  const shaky = stumbles + (rec?.peeks ?? 0) * 0.5
  const settled = Math.min(1, (rec?.streak ?? 0) / 4)
  return Math.max(0, Math.min(1, shaky / 6 + 0.25 - settled * 0.25))
}

export function HifzBoard({ t, lang, onOpenPage }: Props) {
  const [records, setRecords] = useState<PageRecord[]>([])
  const [stumbles, setStumbles] = useState<Map<number, number>>(new Map())
  const [plan, setPlan] = useState<WirdPlan | null>(null)
  const [pagesRead, setPagesRead] = useState(0)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    const [recs, counts] = await Promise.all([allPageRecords(), stumbleCounts()])
    setRecords(recs)
    setStumbles(counts)
  }

  useEffect(() => {
    void (async () => {
      await refresh()
      setPlan(await getPref<WirdPlan | null>('wirdPlan', null))
      setPagesRead(await getPref<number>('wirdPagesRead', 0))
      setLoading(false)
    })()
  }, [])

  const byPage = useMemo(() => new Map(records.map((r) => [r.page, r])), [records])

  // The clock is read once per render rather than inside the scheduler, which
  // takes it as an argument so it stays testable.
  const now = Date.now()
  const due = useMemo(() => dueToday(records, now), [records, now])

  const tiers = useMemo(() => {
    const out: Record<Tier, number> = { sabaq: 0, sabqi: 0, manzil: 0 }
    for (const r of records) out[tierOf(r, now)]++
    return out
  }, [records, now])

  const wird = useMemo(() => (plan ? wirdSchedule(plan) : null), [plan])
  const progress = useMemo(
    () => (wird ? wirdProgress(wird, pagesRead) : null),
    [wird, pagesRead],
  )

  const choosePlan = async (p: WirdPlan | null) => {
    setPlan(p)
    await setPref('wirdPlan', p)
  }

  const advanceWird = async (to: number) => {
    const next = Math.max(0, Math.min(PAGES, to))
    setPagesRead(next)
    await setPref('wirdPagesRead', next)
  }

  if (loading) return <p className="empty">{t.loading}</p>

  const touched = records.length

  return (
    <div className="hifz">
      {/*
        Pages, never a percentage. A percentage of the Quran is not a thing a
        student is ever asked for, and it invites comparison with other
        people, which is the documented way hifz motivation goes wrong.
      */}
      <div className="hifz-tiers">
        <div className="tier">
          <span className="tier-n">{digits(lang, tiers.sabaq)}</span>
          <span className="tier-name">{t.sabaq}</span>
        </div>
        <div className="tier">
          <span className="tier-n">{digits(lang, tiers.sabqi)}</span>
          <span className="tier-name">{t.sabqi}</span>
        </div>
        <div className="tier">
          <span className="tier-n">{digits(lang, tiers.manzil)}</span>
          <span className="tier-name">{t.manzil}</span>
        </div>
      </div>

      <p className="hifz-note">{t.tiersNote}</p>

      <h3 className="hifz-h">{t.dueToday}</h3>
      {due.length === 0 ? (
        <p className="empty small">{touched ? t.nothingDue : t.noPagesYet}</p>
      ) : (
        <ul className="due-list">
          {due.slice(0, 12).map((r) => (
            <li key={r.page}>
              <button className="due-row" onClick={() => onOpenPage?.(r.page)}>
                <span className="due-page">{t.pageN(r.page)}</span>
                <span className="due-tier">{t.tierName[tierOf(r, now)]}</span>
                <span className="due-act">{t.review}</span>
              </button>
              <button
                className="btn tiny"
                onClick={async () => {
                  await markReviewed(r.page, 0, Date.now())
                  await refresh()
                }}
              >
                {t.markClean}
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="hifz-h">{t.heatMap}</h3>
      <p className="hifz-note">{t.heatNote}</p>
      {/*
        All 604 pages at once. It is a navigation surface and an honest look
        at the whole mushaf in the same object.
      */}
      <div className="heat" role="img" aria-label={t.heatMap}>
        {Array.from({ length: PAGES }, (_, i) => {
          const page = i + 1
          const h = heat(byPage.get(page), stumbles.get(page) ?? 0)
          return (
            <button
              key={page}
              className={`heat-cell${byPage.has(page) ? ' seen' : ''}`}
              style={{ opacity: h ? 0.25 + h * 0.75 : undefined }}
              title={t.pageN(page)}
              aria-label={t.pageN(page)}
              onClick={() => onOpenPage?.(page)}
            />
          )
        })}
      </div>

      <h3 className="hifz-h">{t.wird}</h3>
      <div className="wird-plans">
        {(['seven', 'thirty', 'ramadan'] as WirdPlan[]).map((p) => (
          <button
            key={p}
            className={`btn${plan === p ? ' on' : ''}`}
            onClick={() => void choosePlan(plan === p ? null : p)}
          >
            {t.wirdName[p]}
          </button>
        ))}
      </div>

      {wird && progress && (
        <div className="wird-state">
          <p className="wird-day">
            {t.wirdDay(progress.day, wird.length)} ·{' '}
            {t.wirdRange(
              wird[Math.min(progress.day, wird.length) - 1].fromPage,
              wird[Math.min(progress.day, wird.length) - 1].toPage,
            )}
          </p>
          {/*
            Debt, not a streak. What is owed is actionable; a flame is only a
            thing to lose.
          */}
          <p className={progress.pagesOwed ? 'wird-owed' : 'wird-clear'}>
            {progress.pagesOwed ? t.pagesOwed(progress.pagesOwed) : t.wirdUpToDate}
          </p>
          <div className="wird-acts">
            <button className="btn" onClick={() => void advanceWird(pagesRead + 1)}>
              {t.readOnePage}
            </button>
            <button
              className="btn"
              onClick={() =>
                void advanceWird(wird[Math.min(progress.day, wird.length) - 1].toPage)
              }
            >
              {t.finishToday}
            </button>
            <button className="btn" onClick={() => void advanceWird(0)}>
              {t.resetWird}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
