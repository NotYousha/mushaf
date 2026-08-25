/**
 * Cross-fade one screen into the next, where the browser can do it.
 *
 * Tabs used to swap instantly: the whole page was one thing and then another
 * thing, with nothing in between to say they were related. Going from the
 * home screen's five faces to the full library is the worst of them, because
 * it is the same content growing and it read as a jump to somewhere else.
 *
 * The View Transitions API does this properly — it snapshots the old frame,
 * runs the update, and animates between them, so the browser handles the
 * work rather than the app animating a list of a hundred and fourteen rows.
 * Safari has had it since 18 and Chrome since 111; everywhere else the state
 * change simply happens, which is exactly what happens today.
 *
 * Reduced motion is honoured by the stylesheet rather than here: the
 * transition still runs, and the CSS gives it no animation to perform.
 */
type WithViewTransition = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> }
}

export function withTransition(update: () => void) {
  const doc = document as WithViewTransition
  if (typeof doc.startViewTransition !== 'function') {
    update()
    return
  }
  try {
    doc.startViewTransition(update)
  } catch {
    // A transition already running, or a browser that exposes it and refuses.
    // The update matters; the animation does not.
    update()
  }
}
