import { describe, it, expect, beforeEach } from 'vitest'
import { pushSurface, popSurface, resetBackStack } from '../src/ui/backstack'

/**
 * The Android back button.
 *
 * Every panel in this app opens and closes by React state, which is complete
 * on the web and is not complete inside a Trusted Web Activity: there is no
 * address bar and no tab, so back navigates history, and the app launches with
 * one entry. Unless something pushes another, back from anywhere closes the
 * app — from a modal, from the surah list, and, because the mushaf turns pages
 * by horizontal scroll-snap, from an edge swipe meant to turn a page.
 *
 * These drive jsdom's real history, so what is under test is the same sequence
 * of pushState and popstate a phone produces. `useBackDismiss` is a wrapper
 * that calls push on open and pop on close; the ordering rules are here.
 */

/**
 * A back press, awaited.
 *
 * popstate is dispatched asynchronously — a microtask is not enough, and a
 * zero-delay timer is not reliably enough either.
 */
const settle = () => new Promise((r) => setTimeout(r, 30))
const back = async () => {
  history.back()
  await settle()
}

/** A tap-to-close, which must give back the entry it took. */
const tapClose = async (id: number) => {
  popSurface(id)
  await settle()
}

beforeEach(() => {
  resetBackStack()
  history.replaceState(null, '', '/mushaf/')
})

describe('the back button', () => {
  it('dismisses an open surface instead of leaving the app', async () => {
    const closed: string[] = []
    pushSurface(() => closed.push('sheet'))
    await back()
    expect(closed).toEqual(['sheet'])
  })

  it('closes only the topmost of two stacked surfaces', async () => {
    const closed: string[] = []
    pushSurface(() => closed.push('panel'))
    // The sheet opens over the panel, so it is the one back should take.
    pushSurface(() => closed.push('sheet'))
    await back()
    expect(closed).toEqual(['sheet'])
    await back()
    expect(closed).toEqual(['sheet', 'panel'])
  })

  it('does not fire a second surface when one is closed by tap', async () => {
    const closed: string[] = []
    pushSurface(() => closed.push('panel'))
    const sheet = pushSurface(() => closed.push('sheet'))
    // Closing by tap consumes the sheet's own entry with history.back(). That
    // fires popstate exactly as a real back press does, so without the guard
    // for our own navigations the panel underneath would close too — one tap
    // dismissing two things.
    await tapClose(sheet)
    expect(closed).toEqual([])
  })

  it('leaves no spent entries behind when surfaces are opened and closed by tap', async () => {
    const closed: string[] = []
    for (let i = 0; i < 6; i++) {
      const id = pushSurface(() => closed.push('x'))
      await tapClose(id)
    }
    // Back to the entry the app launched on, which carries no surface state.
    // Without the history.back() on close, six entries would have piled up and
    // leaving the app would have taken seven presses.
    //
    // `history.length` is not the measure: it counts entries in the session
    // and does not shrink when you go back — only a later push truncates what
    // is in front. Where the cursor sits is the thing under test.
    expect(closed).toEqual([])
    expect(history.state).toBe(null)
  })

  it('is safe when the reader closes a surface that back has already taken', async () => {
    const closed: string[] = []
    const id = pushSurface(() => closed.push('sheet'))
    await back()
    // React now unmounts the surface and its cleanup runs. The entry is
    // already gone; calling back() again here would leave the app.
    await tapClose(id)
    expect(history.state).toBe(null)
    expect(closed).toEqual(['sheet'])
  })
})
