import { describe, it, expect, beforeEach } from 'vitest'
import { PlayerEngine } from '../src/player/engine'

/**
 * One surah following another on a locked phone.
 *
 * The app has always advanced on `ended`, and it worked with the app open
 * and stopped with it closed. The reason is the shape of the code, not the
 * logic: `load` asks IndexedDB whether a saved copy exists before it touches
 * the audio element, and an await is a return to the event loop — which on a
 * locked phone is the one moment iOS may suspend the page, since playback
 * has just stopped. The surah ended, the app went to sleep reaching for the
 * next one, and the recitation stopped for the night.
 *
 * So the lookup happens while sound is still coming out, and all that is
 * left at the end is a src and a play() with nothing between them.
 */

let engine: PlayerEngine

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaSession', {
    configurable: true,
    value: { setActionHandler: () => {}, setPositionState: () => {}, playbackState: 'none' },
  })
  engine = new PlayerEngine()
  engine.el.play = () => Promise.resolve()
})

describe('following on', () => {
  it('has the next surah ready before the current one ends', async () => {
    expect(engine.preparedSurah).toBeNull()
    await engine.prepareNext('haram-1447', 3, 'https://example.test/3.mp3')
    expect(engine.preparedSurah).toBe(3)
  })

  it('starts it without awaiting anything', () => {
    // Synchronous by construction: no promise is returned, so there is no
    // suspension point between the decision and the sound.
    const start = engine.startPrepared
    expect(start.constructor.name).not.toBe('AsyncFunction')
  })

  it('plays what it prepared, and only once', async () => {
    await engine.prepareNext('haram-1447', 3, 'https://example.test/3.mp3')
    expect(engine.startPrepared()).toBe(3)
    expect(engine.el.src).toContain('3.mp3')
    expect(engine.surah).toBe(3)
    // Nothing is left queued, so a second `ended` cannot replay it.
    expect(engine.preparedSurah).toBeNull()
    expect(engine.startPrepared()).toBeNull()
  })

  it('says so when there is nothing ready, rather than pretending', () => {
    expect(engine.startPrepared()).toBeNull()
  })

  it('lets a later preparation replace an earlier one', async () => {
    await engine.prepareNext('haram-1447', 3, 'https://example.test/3.mp3')
    await engine.prepareNext('haram-1447', 9, 'https://example.test/9.mp3')
    expect(engine.preparedSurah).toBe(9)
    expect(engine.startPrepared()).toBe(9)
  })

  it('refuses a surah with no source at all', async () => {
    expect(await engine.prepareNext('haram-1447', 5, null, null)).toBe(false)
    expect(engine.preparedSurah).toBeNull()
  })

  it('drops anything queued when a surah is chosen by hand', async () => {
    await engine.prepareNext('haram-1447', 3, 'https://example.test/3.mp3')

    // jsdom never fires media events, so the load is failed on purpose; what
    // is being asserted is that it cleared the queue on the way past, not
    // that it succeeded. Otherwise the surah just chosen would be followed by
    // whatever had been queued behind a different one.
    const done = engine.load('haram-1447', 40, 'https://example.test/40.mp3')
    const fail = setInterval(() => engine.el.dispatchEvent(new Event('error')), 10)
    await done
    clearInterval(fail)

    expect(engine.preparedSurah).toBeNull()
  })
})
