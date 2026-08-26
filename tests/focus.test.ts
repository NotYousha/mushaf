import { describe, it, expect } from 'vitest'
import { nextFocus, type Candidate, type Rect } from '../src/tv/focus'

const r = (x: number, y: number, width = 100, height = 50): Rect => ({ x, y, width, height })

/*
 *  A grid, laid out as it would be on screen:
 *
 *      a(0,0)    b(200,0)    c(400,0)
 *      d(0,100)  e(200,100)  f(400,100)
 */
const grid: Candidate[] = [
  { id: 'a', rect: r(0, 0) },
  { id: 'b', rect: r(200, 0) },
  { id: 'c', rect: r(400, 0) },
  { id: 'd', rect: r(0, 100) },
  { id: 'e', rect: r(200, 100) },
  { id: 'f', rect: r(400, 100) },
]

describe('nextFocus', () => {
  it('moves to the neighbour in the direction asked for', () => {
    expect(nextFocus(r(0, 0), grid, 'right')).toBe('b')
    expect(nextFocus(r(200, 0), grid, 'right')).toBe('c')
    expect(nextFocus(r(200, 0), grid, 'left')).toBe('a')
    expect(nextFocus(r(0, 0), grid, 'down')).toBe('d')
    expect(nextFocus(r(0, 100), grid, 'up')).toBe('a')
  })

  it('takes the nearest, not merely the first in that direction', () => {
    expect(nextFocus(r(0, 0), grid, 'right')).toBe('b')
    expect(nextFocus(r(0, 0), grid, 'right')).not.toBe('c')
  })

  /*
   * The rule that makes a grid feel like a grid.
   *
   * Moving down from `b` must land on `e` and not on `d`, even though `d` is
   * closer in a straight line from b's corner. Scoring on distance alone
   * makes a remote drift diagonally across a wall of reciters, which is the
   * single most common way a 10-foot UI feels broken.
   */
  it('keeps its column when moving down a grid', () => {
    expect(nextFocus(r(200, 0), grid, 'down')).toBe('e')
    expect(nextFocus(r(400, 0), grid, 'down')).toBe('f')
  })

  it('keeps its row when moving across', () => {
    expect(nextFocus(r(0, 100), grid, 'right')).toBe('e')
  })

  it('returns null at the edge rather than wrapping', () => {
    // Wrapping is worse than stopping: on a long surah list, wrapping from
    // 114 back to 1 on one press loses the reader's place with no undo.
    expect(nextFocus(r(0, 0), grid, 'up')).toBeNull()
    expect(nextFocus(r(0, 0), grid, 'left')).toBeNull()
    expect(nextFocus(r(400, 100), grid, 'right')).toBeNull()
  })

  it('ignores the element it started from', () => {
    expect(nextFocus(r(0, 0), [{ id: 'a', rect: r(0, 0) }], 'right')).toBeNull()
  })

  it('ignores anything with no area, which is how a hidden pane behaves', () => {
    const hidden: Candidate[] = [{ id: 'ghost', rect: r(200, 0, 0, 0) }]
    expect(nextFocus(r(0, 0), hidden, 'right')).toBeNull()
  })

  it('survives an empty candidate list', () => {
    expect(nextFocus(r(0, 0), [], 'down')).toBeNull()
  })

  it('handles a long single column, which is what a surah list is', () => {
    const column: Candidate[] = Array.from({ length: 114 }, (_, i) => ({
      id: `s${i + 1}`,
      rect: r(0, i * 60, 300, 50),
    }))
    expect(nextFocus(r(0, 0, 300, 50), column, 'down')).toBe('s2')
    expect(nextFocus(r(0, 60, 300, 50), column, 'down')).toBe('s3')
    expect(nextFocus(r(0, 60, 300, 50), column, 'up')).toBe('s1')
    expect(nextFocus(r(0, 113 * 60, 300, 50), column, 'down')).toBeNull()
  })
})
