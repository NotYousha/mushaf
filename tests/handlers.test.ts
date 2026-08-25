import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PlayerEngine } from '../src/player/engine'
import { registeredActions } from '../src/player/mediaSession'

/**
 * Announcing the controls, not merely handling them.
 *
 * setActionHandler does two separate things: it stores the handler, and it
 * tells the system the control exists. Only the first is unconditional — the
 * second needs a media session to exist at that moment, and at page load,
 * before a note has been played, there is none.
 *
 * Handlers registered in the engine's constructor were therefore stored and
 * never announced. Stored is enough to make the browser hand us every remote
 * command instead of acting on them itself; announced is what makes the
 * system draw the control. The result was a lock screen with a scrubber that
 * would not drag and a seek handler waiting for a command that could not
 * arrive.
 */

const seen = new Set<string>()
let sessionExists = false

function installSession() {
  Object.defineProperty(navigator, 'mediaSession', {
    configurable: true,
    get: () => (sessionExists ? fake : undefined),
  })
}

const fake = {
  setActionHandler: (action: string, fn: unknown) => {
    if (fn === null) seen.delete(action)
    else seen.add(action)
  },
  setPositionState: () => {},
  playbackState: 'none',
}

beforeEach(() => {
  seen.clear()
  sessionExists = false
  installSession()
})

afterEach(() => {
  sessionExists = false
})

describe('remote controls', () => {
  it('announces the controls once playback has actually begun', async () => {
    // Constructed before anything is playing, which is when the app builds it.
    const engine = new PlayerEngine()
    expect(registeredActions()).not.toContain('seekto')

    // Now a session exists, as it does the moment audio starts.
    sessionExists = true
    engine.el.play = () => Promise.resolve()
    await engine.play()

    // Seeking is the one this was breaking: without it the lock screen draws
    // a scrubber it will not let anyone drag.
    expect(registeredActions()).toContain('seekto')
    expect(registeredActions()).toContain('play')
    expect(registeredActions()).toContain('pause')
  })

  it('does not throw when there is no media session at all', () => {
    expect(() => new PlayerEngine()).not.toThrow()
  })

  it('keeps the handler reference live across re-registration', async () => {
    const engine = new PlayerEngine()
    sessionExists = true
    engine.el.play = () => Promise.resolve()
    await engine.play()

    let asked = 0
    engine.handlers.current = {
      next: () => {},
      prev: () => {},
      step: () => {},
      play: () => {},
      pause: () => {},
      stop: () => {},
      seek: () => {
        asked++
      },
    }
    // Re-registering must not capture a stale reference — the handlers are
    // replaced on every surah change and the lock screen must follow.
    await engine.play()
    engine.handlers.current?.seek(10)
    expect(asked).toBe(1)
  })
})
