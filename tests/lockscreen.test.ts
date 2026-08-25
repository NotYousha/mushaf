import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  registerMediaHandlers,
  setNavAvailability,
  setPosition,
} from '../src/player/mediaSession'
import type { MediaHandlers } from '../src/player/mediaSession'

/**
 * What the lock screen and the Dynamic Island are allowed to show.
 *
 * Apple gives the transport two slots beside play/pause and fills them by
 * precedence: registering the skip commands wins them, and the surah buttons
 * are then never drawn. So on Apple the seek handlers have to stay off, and
 * that is a rule worth a test, because nothing in the app's own UI shows it
 * being broken — you only find out with a phone in your hand.
 */

const registered = new Map<string, unknown>()

const positions: { duration: number; position: number; playbackRate: number }[] = []

function fakeSession() {
  registered.clear()
  positions.length = 0
  Object.defineProperty(navigator, 'mediaSession', {
    configurable: true,
    value: {
      setActionHandler: (action: string, fn: unknown) => {
        if (fn === null) registered.delete(action)
        else registered.set(action, fn)
      },
      setPositionState: (p: { duration: number; position: number; playbackRate: number }) => {
        positions.push(p)
      },
    },
  })
}

/** Just enough of an audio element for the position reporter. */
const fakeAudio = (at: number, rate = 1) =>
  ({ duration: 3600, currentTime: at, playbackRate: rate }) as HTMLAudioElement

function pretend(ua: string, touchPoints = 0) {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua })
  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    value: touchPoints,
  })
}

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

const ua = navigator.userAgent
const touch = navigator.maxTouchPoints

const ref: { current: MediaHandlers | null } = { current: null }

beforeEach(fakeSession)
afterEach(() => pretend(ua, touch))

describe('lock-screen transport', () => {
  it('leaves both slots to the surah on an iPhone', () => {
    pretend(IPHONE, 5)
    registerMediaHandlers(ref)
    expect(registered.has('nexttrack')).toBe(true)
    expect(registered.has('previoustrack')).toBe(true)
    // These are what took the slots and made the surah unchangeable.
    expect(registered.has('seekforward')).toBe(false)
    expect(registered.has('seekbackward')).toBe(false)
  })

  it('treats an iPad reporting itself as a Mac as a phone would be treated', () => {
    pretend(IPAD_AS_MAC, 5)
    registerMediaHandlers(ref)
    expect(registered.has('seekforward')).toBe(false)
  })

  it('keeps ayah stepping where it costs nothing', () => {
    pretend(ANDROID, 5)
    registerMediaHandlers(ref)
    expect(registered.has('seekforward')).toBe(true)
    expect(registered.has('seekbackward')).toBe(true)
    expect(registered.has('nexttrack')).toBe(true)
  })

  it('scrubbing survives on every platform', () => {
    for (const agent of [IPHONE, ANDROID]) {
      fakeSession()
      pretend(agent, 5)
      registerMediaHandlers(ref)
      expect(registered.has('seekto')).toBe(true)
    }
  })

  it('greys out next only at the end, and never greys out previous', () => {
    pretend(IPHONE, 5)
    registerMediaHandlers(ref)

    setNavAvailability(false, ref)
    expect(registered.has('nexttrack')).toBe(false)
    // Previous restarts the surah in hand, so it always has work to do.
    expect(registered.has('previoustrack')).toBe(true)

    setNavAvailability(true, ref)
    expect(registered.has('nexttrack')).toBe(true)
  })

  it('routes a press through the live reference, never a captured one', () => {
    pretend(IPHONE, 5)
    registerMediaHandlers(ref)
    const seen: string[] = []
    ref.current = {
      next: () => seen.push('next'),
      prev: () => seen.push('prev'),
      step: () => seen.push('step'),
      play: () => {},
      pause: () => {},
      stop: () => {},
      seek: () => {},
    }
    ;(registered.get('nexttrack') as () => void)()
    ;(registered.get('previoustrack') as () => void)()
    expect(seen).toEqual(['next', 'prev'])
  })

  /**
   * The lock screen scrubber.
   *
   * WebKit forwards a Now Playing update to the system only when one of the
   * fields it compares has changed, and the position is not one of them — so
   * an update that says only "we are somewhere else now" is thrown away, and
   * a dropped scrubber springs back to where the system still thinks we are.
   * The rate is compared, and it only drives extrapolation between updates,
   * so it is the field to move.
   */
  it('reports a different rate each time a seek must be acknowledged', () => {
    pretend(IPHONE, 5)
    setPosition(fakeAudio(100), true)
    setPosition(fakeAudio(900), true)
    setPosition(fakeAudio(1700), true)

    expect(positions).toHaveLength(3)
    expect(positions.map((p) => p.position)).toEqual([100, 900, 1700])
    // Consecutive forced updates must never repeat a rate, or the second one
    // is indistinguishable from the first and is discarded.
    expect(positions[0].playbackRate).not.toBe(positions[1].playbackRate)
    expect(positions[1].playbackRate).not.toBe(positions[2].playbackRate)
  })

  it('keeps the nudge far below anything audible or visible', () => {
    pretend(IPHONE, 5)
    setPosition(fakeAudio(10, 1.25), true)
    setPosition(fakeAudio(20, 1.25), true)
    for (const p of positions) {
      // Within a hundredth of a percent of the real rate: a third of a second
      // of drift per hour, against a fresh position every second.
      expect(Math.abs(p.playbackRate - 1.25) / 1.25).toBeLessThan(0.0002)
      // Zero throws, and a paused player is expressed by playbackState.
      expect(p.playbackRate).toBeGreaterThan(0)
    }
  })

  it('never reports a position outside the recording', () => {
    pretend(IPHONE, 5)
    setPosition({ duration: 60, currentTime: 90, playbackRate: 1 } as HTMLAudioElement, true)
    setPosition({ duration: 60, currentTime: -5, playbackRate: 1 } as HTMLAudioElement, true)
    // setPositionState throws a TypeError on a position past the duration,
    // which would take the whole lock screen down with it.
    for (const p of positions) {
      expect(p.position).toBeGreaterThanOrEqual(0)
      expect(p.position).toBeLessThanOrEqual(p.duration)
    }
  })

  it('says nothing when the duration is not known yet', () => {
    pretend(IPHONE, 5)
    setPosition({ duration: NaN, currentTime: 0, playbackRate: 1 } as HTMLAudioElement, true)
    setPosition({ duration: Infinity, currentTime: 0, playbackRate: 1 } as HTMLAudioElement, true)
    expect(positions).toHaveLength(0)
  })
})
