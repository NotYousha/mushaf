import { useCallback, useEffect, useMemo, useRef } from 'react'

/**
 * Follow-the-recitation scrolling that gets out of the reader's way.
 *
 * `scrollIntoView` cannot do this job, for two reasons that both showed up as
 * bugs. It scrolls *every* scrollable ancestor, so inside the mushaf it moved
 * the horizontal page strip as well as the page — and `onStripScroll` read
 * that back as the reader turning the page and switched follow-the-recitation
 * off. And it has no notion of the reader having taken over, so a reader who
 * scrolled ahead to read something was dragged back a second later.
 *
 * This writes `scrollTop` on one named scroller, and stands down the moment
 * the reader moves it themselves. It re-arms on a rearm key — a seek, a new
 * surah, a fresh play — because those are the moments the reader is asking to
 * be taken somewhere again.
 */

/** The nearest ancestor that actually scrolls vertically, or null. */
export function scrollParentY(el: Element | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const style = getComputedStyle(node)
    const scrolls = /auto|scroll|overlay/.test(style.overflowY)
    if (scrolls && node.scrollHeight > node.clientHeight + 1) return node
    node = node.parentElement
  }
  return null
}

/**
 * Centre `target` in `scroller` on the vertical axis only.
 *
 * Returns the resting scrollTop so a caller can recognise its own write when
 * the scroll event arrives. Deliberately not smooth: at word granularity a
 * recitation issues these several times a second, and each smooth animation
 * cancels the one before it, which is the jitter.
 */
export function centreY(scroller: HTMLElement, target: Element): number {
  const s = scroller.getBoundingClientRect()
  const t = target.getBoundingClientRect()
  const delta = t.top + t.height / 2 - (s.top + s.height / 2)
  if (Math.abs(delta) >= 1) scroller.scrollTop += delta
  return scroller.scrollTop
}

/** True when `target` sits inside the middle `band` of `scroller`. */
export function withinBand(scroller: HTMLElement, target: Element, band = 0.6): boolean {
  const s = scroller.getBoundingClientRect()
  const t = target.getBoundingClientRect()
  const margin = (s.height * (1 - band)) / 2
  return t.top >= s.top + margin && t.bottom <= s.bottom - margin
}

type Follower = {
  /** Move `target` into view, unless the reader has taken over. */
  follow: (target: Element | null | undefined, opts?: { band?: number }) => void
  /** Hand control back to the recitation (a seek, a new surah). */
  rearm: () => void
  /** Whether the reader currently owns the scroller. */
  readerOwns: () => boolean
}

/**
 * @param getScroller resolved lazily — the scroller may not exist on mount,
 *                    and in the mushaf it is found by walking up from the word.
 * @param rearmKey    changing this hands control back to the recitation.
 */
export function useFollower(
  getScroller: () => HTMLElement | null,
  rearmKey: unknown,
): Follower {
  // What we last set, so the scroll event we caused is not mistaken for the
  // reader. null means "we are not expecting an echo".
  const expected = useRef<number | null>(null)
  const released = useRef(false)
  const bound = useRef<HTMLElement | null>(null)

  const onScroll = useCallback((e: Event) => {
    const el = e.currentTarget as HTMLElement
    const mine = expected.current
    // A tolerance, not equality: the browser clamps and rounds scrollTop, and
    // a sub-pixel difference is still our own write coming back.
    if (mine !== null && Math.abs(el.scrollTop - mine) <= 2) return
    released.current = true
    expected.current = null
  }, [])

  const bind = useCallback(
    (el: HTMLElement | null) => {
      if (bound.current === el) return
      bound.current?.removeEventListener('scroll', onScroll)
      bound.current = el
      el?.addEventListener('scroll', onScroll, { passive: true })
    },
    [onScroll],
  )

  useEffect(() => {
    return () => {
      bound.current?.removeEventListener('scroll', onScroll)
      bound.current = null
    }
  }, [onScroll])

  // A seek or a new surah is the reader asking to be taken somewhere.
  useEffect(() => {
    released.current = false
    expected.current = null
  }, [rearmKey])

  const follow = useCallback(
    (target: Element | null | undefined, opts?: { band?: number }) => {
      if (!target || released.current) return
      const scroller = getScroller()
      if (!scroller) return
      bind(scroller)
      // Already comfortably on screen: moving would be motion for its own sake
      // and is what makes word-level following jitter.
      if (withinBand(scroller, target, opts?.band ?? 0.6)) return
      expected.current = centreY(scroller, target)
    },
    [bind, getScroller],
  )

  const rearm = useCallback(() => {
    released.current = false
    expected.current = null
  }, [])

  const readerOwns = useCallback(() => released.current, [])

  // Memoised: callers put this in an effect's dependency list, and a fresh
  // object every render would run the follow on every render instead of only
  // when the recited word or ayah changes.
  return useMemo(() => ({ follow, rearm, readerOwns }), [follow, rearm, readerOwns])
}
