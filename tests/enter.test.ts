import { describe, it, expect } from 'vitest'
import { shouldEnterApp, APP_PATH, USED_KEY } from '../src/landing/enter'

describe('shouldEnterApp', () => {
  /*
   * The migration case, and the reason this function exists.
   *
   * Installed apps hold start_url /mushaf/ until they pick up a new manifest.
   * Scope still covers /mushaf/app/ so nothing is broken, but launching the
   * installed app would land on a marketing page — which reads exactly like
   * the app having been replaced by an advert for itself.
   */
  it('sends an installed app straight through', () => {
    expect(shouldEnterApp({ standalone: true, hasUsedApp: false })).toBe(true)
  })

  it('sends a returning reader straight through', () => {
    expect(shouldEnterApp({ standalone: false, hasUsedApp: true })).toBe(true)
  })

  /*
   * A first-time visitor sees the landing page, on a phone as much as on a
   * desktop. Someone who was sent a link and gets an app they have never seen
   * instead of the page that was sent to them is worse served than the
   * redirect is worth, and the landing page is responsive.
   */
  it('shows a first-time visitor the page they were sent', () => {
    expect(shouldEnterApp({ standalone: false, hasUsedApp: false })).toBe(false)
  })
})

describe('the constants the boot script and the landing page share', () => {
  /*
   * These two literals are written in three places that cannot import each
   * other: here, the app's inline boot script (which sets the flag) and the
   * landing page's module (which reads it). Asserting the values keeps a
   * rename from silently sending every returning reader to the front door.
   */
  it('are the values the inline scripts hardcode', () => {
    expect(USED_KEY).toBe('mushaf:used')
    expect(APP_PATH).toBe('app/')
  })
})
