/**
 * Moving focus with a remote control.
 *
 * A television browser gives you no focus model worth having: Tab order is
 * meaningless on a wall of tiles, and `:focus` follows whatever the page last
 * clicked. So the app supplies its own — a function over rectangles, with no
 * DOM and no events in it, which is the only reason a television layout can be
 * tested on a laptop.
 *
 * The scoring is the whole design. Nearest-by-distance alone is the obvious
 * approach and it is wrong: moving down a grid of reciters from the second
 * column, the tile diagonally below-left is often closer to the starting
 * corner than the one directly below, so focus drifts sideways one row at a
 * time. That drift is the single thing that makes a 10-foot interface feel
 * broken, so misalignment across the axis of travel is penalised heavily
 * enough that it can never be won by proximity along it.
 */

export type Rect = { x: number; y: number; width: number; height: number }

export type Dir = 'up' | 'down' | 'left' | 'right'

export type Candidate = { id: string; rect: Rect }

const centreX = (r: Rect) => r.x + r.width / 2
const centreY = (r: Rect) => r.y + r.height / 2

/**
 * How far past the starting edge a candidate has to be before it counts as
 * lying in that direction at all.
 *
 * Without a threshold, two tiles in the same row whose tops differ by a
 * sub-pixel rounding error each count as "below" the other, and pressing down
 * moves sideways.
 */
const EDGE = 1

/**
 * What misalignment costs, relative to distance travelled.
 *
 * Four is not arbitrary: the widest tile in the reciter wall is about a
 * quarter of the screen, so a penalty of four guarantees that one column of
 * drift always costs more than any distance a single press can cover.
 */
const DRIFT = 4

export function nextFocus(from: Rect, candidates: Candidate[], dir: Dir): string | null {
  const vertical = dir === 'up' || dir === 'down'
  let best: string | null = null
  let bestScore = Infinity

  for (const c of candidates) {
    const { rect } = c
    // A zero-area rectangle is a hidden pane or a collapsed rail. It is not
    // focusable, and a remote landing on it looks like the remote is dead.
    if (rect.width <= 0 || rect.height <= 0) continue
    // The element focus is already on. Compared by rectangle rather than id so
    // a caller does not have to know its own id.
    if (rect.x === from.x && rect.y === from.y && rect.width === from.width) continue

    // Along the axis of travel: how far, and is it even the right way?
    let along: number
    if (dir === 'right') along = rect.x - (from.x + from.width)
    else if (dir === 'left') along = from.x - (rect.x + rect.width)
    else if (dir === 'down') along = rect.y - (from.y + from.height)
    else along = from.y - (rect.y + rect.height)

    // Overlapping neighbours in a dense list give a small negative gap, which
    // is still the right way; anything meaningfully behind the start is not.
    if (along < -EDGE) continue

    const across = vertical
      ? Math.abs(centreX(rect) - centreX(from))
      : Math.abs(centreY(rect) - centreY(from))

    const score = Math.max(along, 0) + across * DRIFT
    if (score < bestScore) {
      bestScore = score
      best = c.id
    }
  }

  return best
}
