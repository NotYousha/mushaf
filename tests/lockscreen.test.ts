import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { registerMediaHandlers, setNavAvailability } from '../src/player/mediaSession'
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

function fakeSession() {
  registered.clear()
  Object.defineProperty(navigator, 'mediaSession', {
    configurable: true,
    value: {
      setActionHandler: (action: string, fn: unknown) => {
        if (fn === null) registered.delete(action)
        else registered.set(action, fn)
      },
    },
  })
}

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
})
