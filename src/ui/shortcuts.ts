import type { SurfaceId } from '../surface'

export type Action =
  | 'toggle'
  | 'next'
  | 'prev'
  | 'ayahNext'
  | 'ayahPrev'
  | 'palette'
  | 'goto'

/** Just enough of a KeyboardEvent to be constructed in a test. */
export type KeyLike = {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  target?: { tagName?: string; isContentEditable?: boolean } | null
}

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/

/**
 * Which action a keypress means, if any.
 *
 * Two things here are load-bearing, and both are the usual way this feature
 * ships broken.
 *
 * The first is the typing guard. The Quran tab has a search field, and without
 * the guard, typing a surah name puts a space in the box *and* pauses the
 * recitation, while pressing g silently opens a go-to-page prompt mid-word.
 * The palette is the one deliberate exception, because its own field has focus
 * at the moment you press the key that closes it.
 *
 * The second is that only the desktop gets any of this. On a television the
 * arrows move focus and a remote has no modifier key, so two handlers on the
 * arrows means a remote that seeks the audio instead of moving. A phone has no
 * keyboard to claim in the first place.
 */
export function matchShortcut(e: KeyLike, surface: SurfaceId): Action | null {
  const mod = e.metaKey === true || e.ctrlKey === true

  // Checked before the surface and before the typing guard: it is the way out
  // of its own field, and it costs nothing anywhere else.
  if (mod && !e.altKey && e.key.toLowerCase() === 'k') return 'palette'

  if (surface !== 'desktop') return null

  const tag = e.target?.tagName ?? ''
  if (TYPING.test(tag) || e.target?.isContentEditable === true) return null

  // Any other modifier means the browser's own shortcut, not ours. Taking
  // ctrl+ArrowRight would steal a word-jump; taking cmd+ArrowLeft would steal
  // Back.
  if (mod || e.altKey === true) return null

  switch (e.key) {
    case ' ':
      return 'toggle'
    case 'ArrowRight':
      return 'next'
    case 'ArrowLeft':
      return 'prev'
    case ']':
      return 'ayahNext'
    case '[':
      return 'ayahPrev'
    case 'g':
    case 'G':
      return 'goto'
    default:
      return null
  }
}
