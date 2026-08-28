import { useEffect, useRef } from 'react'

/**
 * The Android back button, for surfaces that are only React state.
 *
 * On the web a panel that opens by `setState` and closes by `setState` is
 * complete. Inside a Trusted Web Activity it is not: there is no address bar
 * and no tab, and the hardware back button — or the edge swipe that replaced
 * it on every phone sold since Android 10 — navigates browser history. The app
 * launches with exactly one entry, so unless something has pushed another,
 * *every* back press from *every* screen lands on the first entry and Chrome
 * finishes the activity.
 *
 * What that meant here: back from the surah list quit the app. Back from the
 * mushaf quit the app. Back from the "download all — 95 MB?" confirmation quit
 * the app. And because the mushaf turns pages by horizontal scroll-snap, an
 * edge swipe to turn a page was claimed by the system back gesture and quit
 * the app too. The only dismiss affordance that existed was the Escape key,
 * which no phone has.
 *
 * So each dismissible surface takes a history entry while it is open, and one
 * shared `popstate` listener closes the topmost. Two rules keep it honest:
 *
 *  - Only the top of the stack reacts. Otherwise a single back press would
 *    close the sheet, the panel underneath it and the drill-in all at once.
 *  - Closing by tap consumes the entry it pushed, with `history.back()`. Skip
 *    that and the entries pile up, and a reader who has opened and closed the
 *    same panel six times has to press back six times to leave the app.
 */

type Surface = { id: number; close: () => void }

let seq = 0
const stack: Surface[] = []
/**
 * How many `popstate` events are ours rather than the reader's.
 *
 * `history.back()` fires `popstate` just as a real back press does, so without
 * this the entry consumed on a tap-to-close would be read as a back press and
 * would close whatever was underneath as well.
 */
let ours = 0
let wired = false

function wire() {
  if (wired || typeof window === 'undefined') return
  wired = true
  window.addEventListener('popstate', () => {
    if (ours > 0) {
      ours--
      return
    }
    const top = stack.pop()
    top?.close()
  })
}

/**
 * Take a history entry for a surface that has just opened.
 *
 * Exported for the tests, which drive this directly: the hook below is a thin
 * wrapper, and testing it would mean adding a React renderer to the suite for
 * the sake of three lines that do nothing but call these two.
 */
export function pushSurface(close: () => void): number {
  wire()
  const id = ++seq
  stack.push({ id, close })
  try {
    history.pushState({ mushafSurface: id }, '')
  } catch {
    // Some embedders cap pushState. A back press then leaves the app, which is
    // what happened before this existed — degraded, not broken.
  }
  return id
}

/** Give back the entry `pushSurface` took, when the surface closes by tap. */
export function popSurface(id: number) {
  const i = stack.findIndex((e) => e.id === id)
  // Not found means the reader's own back press already took it off, and the
  // history entry went with it. Calling back() again would leave the app.
  if (i === -1) return
  stack.splice(i, 1)
  ours++
  try {
    history.back()
  } catch {
    ours--
  }
}

/**
 * Make `close` the answer to the back button for as long as `open` is true.
 *
 * `close` is read through a ref, so a handler that closes over fresh state
 * does not have to be memoised to be correct — passing an inline arrow is
 * fine, and does not churn the history stack.
 */
export function useBackDismiss(open: boolean, close: () => void) {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!open) return
    const id = pushSurface(() => closeRef.current())
    return () => popSurface(id)
  }, [open])
}

/** Test seam: forget every surface and unwire the listener. */
export function resetBackStack() {
  stack.length = 0
  ours = 0
  seq = 0
}
