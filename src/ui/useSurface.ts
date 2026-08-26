import { useCallback, useEffect, useState } from 'react'
import {
  applySurface,
  bootSurface,
  probe,
  resolveSurface,
  watchSurface,
  asChoice,
  type SurfaceChoice,
  type SurfaceId,
} from '../surface'
import { getPref, setPref } from '../db/prefs'

const PREF = 'surface'

/**
 * The surface, as React sees it.
 *
 * Seeded from the same localStorage copy the boot script read, so the first
 * render agrees with what is already stamped on <html> and nothing moves after
 * mount. That agreement is the whole point — the flash this arrangement exists
 * to prevent was never the boot script getting it wrong, it was React mounting
 * with a default and stamping over the right answer.
 *
 * IndexedDB is still the source of truth and is reconciled once it answers,
 * which matters only for someone whose localStorage was cleared but whose
 * IndexedDB was not.
 */
export function useSurface() {
  const [choice, setChoiceState] = useState<SurfaceChoice>(bootSurface)
  const [surface, setSurface] = useState<SurfaceId>(() => resolveSurface(probe(), bootSurface()))

  /*
   * Re-resolve when the environment moves. Rotating a tablet crosses 48rem,
   * dragging a window narrow crosses 64rem, and plugging in a mouse flips
   * `pointer: fine` with no resize event at all — which is why the pointer
   * queries are watched and not only the size.
   */
  useEffect(() => {
    const settle = () => setSurface(applySurface(choice))
    settle()
    return watchSurface(settle)
  }, [choice])

  /*
   * Reconcile with IndexedDB once, on mount.
   *
   * Deliberately not depending on `choice`: re-running this whenever the choice
   * changed would race the write below and could put the old value back.
   */
  useEffect(() => {
    let alive = true
    void getPref<SurfaceChoice | null>(PREF, null).then((stored) => {
      if (!alive || stored === null) return
      const valid = asChoice(stored)
      setChoiceState((current) => (valid === current ? current : valid))
    })
    return () => {
      alive = false
    }
  }, [])

  const setChoice = useCallback((next: SurfaceChoice) => {
    setChoiceState(next)
    setSurface(applySurface(next))
    void setPref(PREF, next)
  }, [])

  return { surface, choice, setChoice }
}
