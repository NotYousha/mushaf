import type { ReactNode } from 'react'
import type { SurfaceId } from '../surface'

/**
 * Which surfaces get two panes.
 *
 * Not the phone, where push navigation is right and there is no room for both.
 * Not the television: two columns at ten feet leaves neither legible, and a
 * remote has no way of crossing between them that beats one focused list. Not
 * a native shell, where the platform's tab bar is sized for one pane and the
 * app is a phone in every wrapper that ships today.
 */
export const splits = (surface: SurfaceId): boolean =>
  surface === 'tablet' || surface === 'desktop'

/**
 * Where the list pane sits.
 *
 * Always the leading edge — which is the left in English and the right in
 * Arabic and Urdu. Returning a logical value rather than 'left' or 'right' is
 * what lets one grid rule serve all five languages; the alternative is a
 * mirrored stylesheet, and this app has two RTL languages out of five.
 */
export const listSide = (_dir: 'rtl' | 'ltr'): 'start' | 'end' => 'start'

type Props = {
  surface: SurfaceId
  /** The persistent pane: the surah list. */
  list: ReactNode
  /**
   * The reader and the player.
   *
   * Taken as children rather than a prop so that wrapping the existing
   * scroller is a wrap, and not a re-indentation of four hundred lines of
   * tab panels.
   */
  children: ReactNode
  /** Landscape only, where the list collapses to a rail. */
  listOpen?: boolean
}

/**
 * Two panes, or one.
 *
 * On a surface that does not split this renders `main` alone with no wrapper
 * element at all, so the phone's DOM is exactly what it was — the phone layout
 * is the best thing in this app and none of this improves it.
 */
export function SplitView({ surface, list, children, listOpen = false }: Props) {
  if (!splits(surface)) return <>{children}</>

  return (
    <div className="split">
      <aside className={`split-list${listOpen ? ' is-open' : ''}`}>{list}</aside>
      <div className="split-main">{children}</div>
    </div>
  )
}
