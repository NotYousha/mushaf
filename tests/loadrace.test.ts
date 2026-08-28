import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { PlayerEngine } from '../src/player/engine'
import { savePosition, loadPosition } from '../src/db/prefs'

/**
 * Two loads racing for one audio element.
 *
 * There is one `<audio>`, and `load` awaits several times before it is
 * finished with it — once on IndexedDB, then up to three times on the network,
 * each for as long as fifteen seconds. Tap a surah whose host is slow, tap a
 * different one before it gives up, and the first call used to wake to find
 * the element playing something else and assign its fallback over the top.
 *
 * The listener heard surah 5 while every label on screen said surah 9, and the
 * position writer filed one surah's playhead under the other's name. It is the
 * same class of fault as the one `purgeSuspectAudio` exists to clean up after,
 * and it is the reason for the load token in engine.ts.
 */

let engine: PlayerEngine

/**
 * Wait until `load` has actually reached the element.
 *
 * `load` asks IndexedDB for a saved copy before it touches the audio element,
 * so a test that dispatches an event straight after calling it dispatches into
 * nothing: `trySrc` has not attached its listeners yet. Waiting on the `src`
 * changing is waiting on exactly the step that matters.
 */
async function reachedElement(engine: PlayerEngine, previous: string) {
  for (let i = 0; i < 200; i++) {
    if (engine.el.src && engine.el.src !== previous) return engine.el.src
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('load never assigned a src')
}

/** Drive the element's readiness by hand: jsdom does not load media. */
function settleAs(engine: PlayerEngine, event: 'loadedmetadata' | 'error') {
  if (event === 'error') {
    Object.defineProperty(engine.el, 'error', {
      configurable: true,
      value: { code: 4 },
    })
  }
  engine.el.dispatchEvent(new Event(event))
}

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaSession', {
    configurable: true,
    value: { setActionHandler: () => {}, setPositionState: () => {}, playbackState: 'none' },
  })
  engine = new PlayerEngine()
  engine.el.play = () => Promise.resolve()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('two loads racing for one element', () => {
  it('does not let a slow load take the element back from the one that replaced it', async () => {
    const slow = engine.load('r', 5, 'https://example.test/5.mp3', 'https://example.test/5-alt.mp3')
    await reachedElement(engine, '')
    // The listener gives up waiting and taps surah 9.
    const fast = engine.load('r', 9, 'https://example.test/9.mp3')
    await reachedElement(engine, 'https://example.test/5.mp3')
    settleAs(engine, 'loadedmetadata')
    expect(await fast).toEqual({ ok: true, mode: 'streaming' })
    const src9 = engine.el.src

    // Now surah 5's original host finally errors. Before the token, this ran
    // the next candidate and assigned 5's fallback over surah 9 — stopping the
    // recitation the listener actually asked for and starting a different one
    // under its name.
    settleAs(engine, 'error')
    const outcome = await slow
    expect(outcome.ok).toBe(false)
    expect(engine.el.src).toBe(src9)
  })

  it('reports a superseded load as superseded, so no error is shown for it', async () => {
    const slow = engine.load('r', 5, 'https://example.test/5.mp3')
    await reachedElement(engine, '')
    const fast = engine.load('r', 9, 'https://example.test/9.mp3')
    await reachedElement(engine, 'https://example.test/5.mp3')
    settleAs(engine, 'loadedmetadata')
    await fast
    settleAs(engine, 'error')
    const outcome = await slow
    // The thing this failure would report has already been replaced by what
    // the listener asked for, so App.tsx must be able to tell it apart from a
    // real one and keep the toast off the screen.
    expect(outcome).toMatchObject({ ok: false, superseded: true })
  })
})

describe('a load that fails entirely', () => {
  it('does not overwrite the stored position with zero', async () => {
    // An hour and a half into al-Baqarah, saved from a previous evening.
    await savePosition('r', 2, 5520)

    const attempt = engine.load('r', 2, 'https://example.test/2.mp3')
    await reachedElement(engine, '')
    settleAs(engine, 'error')
    expect((await attempt).ok).toBe(false)

    // The engine used to name the surah before trying to load it, so a total
    // failure left it pointing at surah 2 with the element at zero — and the
    // next pause or tab switch flushed that zero over the resume point.
    engine.el.dispatchEvent(new Event('pause'))
    await new Promise((r) => setTimeout(r, 20))

    expect(await loadPosition()).toMatchObject({ reciterId: 'r', surah: 2, seconds: 5520 })
  })
})
