import { useEffect } from 'react'
import { nextFocus, type Candidate, type Dir } from './focus'

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

/**
 * What a remote can land on.
 *
 * Queried live on each press rather than kept in state: the surah list is
 * virtualised and the reciter wall is filtered, so a cached list would be
 * stale by the second press and focus would jump to an element that has been
 * unmounted.
 */
const focusables = (): { el: HTMLElement; cand: Candidate }[] => {
  const nodes = document.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), [role="tab"], [role="radio"], [tabindex]:not([tabindex="-1"])',
  )
  return [...nodes].map((el, i) => {
    const b = el.getBoundingClientRect()
    // The id is positional and lives only for this press, so nothing in the
    // app has to grow an id attribute to be reachable by a remote.
    el.dataset.tvIndex = String(i)
    return {
      el,
      cand: { id: String(i), rect: { x: b.x, y: b.y, width: b.width, height: b.height } },
    }
  })
}

type Props = { active: boolean }

/**
 * Arrow keys, Enter and Escape, while a television is the surface.
 *
 * Mounted rather than always-on, and it claims nothing when inactive: on a
 * desktop the arrow keys seek the player and on a phone there is no keyboard
 * at all, so a manager that ran everywhere would break both.
 */
export function FocusManager({ active }: Props) {
  useEffect(() => {
    if (!active) return

    const onKey = (e: KeyboardEvent) => {
      // A remote's number pad and an on-screen keyboard both produce real
      // typing, and a search field must keep it.
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) {
        if (e.key === 'Escape') target.blur()
        return
      }

      if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack') {
        // History is the natural meaning of Back on a television, and the app
        // already pushes a state per screen.
        e.preventDefault()
        history.back()
        return
      }

      const dir = KEYS[e.key]
      if (!dir) return

      const all = focusables()
      const current = document.activeElement as HTMLElement | null
      const from = current?.getBoundingClientRect()
      // Nothing focused yet — the first press should land somewhere sensible
      // rather than doing nothing, which reads as a dead remote.
      if (!from || from.width === 0) {
        e.preventDefault()
        all[0]?.el.focus()
        return
      }

      const id = nextFocus(
        { x: from.x, y: from.y, width: from.width, height: from.height },
        all.map((a) => a.cand),
        dir,
      )
      if (id === null) return
      e.preventDefault()
      const next = all.find((a) => a.cand.id === id)
      next?.el.focus()
      // Keep the focused thing on screen. `nearest` rather than `center`, so a
      // list does not lurch a full page on every press.
      next?.el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  return null
}
