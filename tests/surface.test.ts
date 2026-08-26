import { describe, it, expect, beforeEach } from 'vitest'
import {
  resolveSurface,
  asChoice,
  bootSurface,
  applySurface,
  SURFACES,
  SURFACE_KEY,
  DEFAULT_CHOICE,
  type Probe,
} from '../src/surface'

/** A phone: narrow, coarse, no hover. Overridden per case. */
const p = (over: Partial<Probe> = {}): Probe => ({
  width: 390,
  hover: false,
  fine: false,
  coarse: true,
  tvUA: false,
  native: false,
  ...over,
})

describe('resolveSurface', () => {
  it('calls a phone a phone', () => {
    expect(resolveSurface(p(), 'auto')).toBe('phone')
    // A large phone is still a phone: 428 is an iPhone Pro Max in portrait.
    expect(resolveSurface(p({ width: 428 }), 'auto')).toBe('phone')
  })

  it('calls a tablet a tablet from 48rem up', () => {
    // 768 and 834 are the two iPad portrait widths.
    expect(resolveSurface(p({ width: 768 }), 'auto')).toBe('tablet')
    expect(resolveSurface(p({ width: 834 }), 'auto')).toBe('tablet')
    // One pixel below the step is still a phone, so the boundary is exact.
    expect(resolveSurface(p({ width: 767 }), 'auto')).toBe('phone')
  })

  it('needs a real pointer before it will say desktop', () => {
    expect(resolveSurface(p({ width: 1440, fine: true, coarse: false, hover: true }), 'auto')).toBe(
      'desktop',
    )
    // A mouse on a small window is still a desktop; the pointer is the signal.
    expect(resolveSurface(p({ width: 1024, fine: true, coarse: false, hover: true }), 'auto')).toBe(
      'desktop',
    )
    // Below 64rem a mouse gets the tablet layout rather than three panes.
    expect(resolveSurface(p({ width: 900, fine: true, coarse: false, hover: true }), 'auto')).toBe(
      'tablet',
    )
  })

  /*
   * The case this resolver exists for.
   *
   * An iPad Pro in landscape is 1366 wide, coarse, and has no hover — which is
   * exactly what a television looks like through a media query. Width alone
   * would send every iPad to a 10-foot UI, so a TV either identifies itself in
   * the user agent or has to clear a bar no shipping tablet reaches.
   */
  it('does not mistake a landscape iPad Pro for a television', () => {
    expect(resolveSurface(p({ width: 1366 }), 'auto')).toBe('tablet')
  })

  it('believes a television that says so', () => {
    expect(resolveSurface(p({ width: 1280, tvUA: true }), 'auto')).toBe('tv')
    // Android TV's browser reporting 1280 at 1.5x DPR is the common case, and
    // it is below the width bar on purpose — the UA is what carries it.
    expect(resolveSurface(p({ width: 960, tvUA: true }), 'auto')).toBe('tv')
  })

  it('believes a very large screen with no pointer at all', () => {
    // A set-top browser that reports neither fine nor coarse.
    expect(resolveSurface(p({ width: 1920, coarse: false }), 'auto')).toBe('tv')
  })

  it('never calls a laptop on a projector a television', () => {
    // The giveaway is hover: a trackpad has it and a remote control does not.
    expect(resolveSurface(p({ width: 1920, fine: true, coarse: false, hover: true }), 'auto')).toBe(
      'desktop',
    )
  })

  it('lets an explicit choice win over the probe', () => {
    expect(resolveSurface(p(), 'tv')).toBe('tv')
    expect(resolveSurface(p({ width: 1920, fine: true, hover: true }), 'phone')).toBe('phone')
  })

  /*
   * Native outranks everything, including the override.
   *
   * Inside a wrapper the platform owns the bottom of the screen and <Dock>
   * renders nothing, whatever the screen measures. A stored 'tv' from someone
   * experimenting on a laptop must not follow them into the iOS app and take
   * the tab bar away.
   */
  it('lets a native shell outrank both the probe and the override', () => {
    expect(resolveSurface(p({ native: true }), 'auto')).toBe('native')
    expect(resolveSurface(p({ native: true, width: 1920 }), 'tv')).toBe('native')
  })
})

describe('asChoice', () => {
  it('accepts every surface and auto', () => {
    for (const s of SURFACES) expect(asChoice(s)).toBe(s)
    expect(asChoice('auto')).toBe('auto')
  })

  it('falls back rather than stamping something no stylesheet matches', () => {
    for (const junk of ['', 'watch', 'null', '__proto__', undefined, null, 42, {}]) {
      expect(asChoice(junk)).toBe(DEFAULT_CHOICE)
    }
  })
})

describe('bootSurface', () => {
  beforeEach(() => localStorage.clear())

  it('reads the mirrored copy', () => {
    localStorage.setItem(SURFACE_KEY, 'tv')
    expect(bootSurface()).toBe('tv')
  })

  it('defaults to auto when nothing is stored', () => {
    expect(bootSurface()).toBe(DEFAULT_CHOICE)
  })

  it('defaults to auto on a retired value', () => {
    localStorage.setItem(SURFACE_KEY, 'watch')
    expect(bootSurface()).toBe(DEFAULT_CHOICE)
  })
})

describe('applySurface', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-surface')
  })

  it('stamps the resolved surface on the document', () => {
    applySurface('tv')
    expect(document.documentElement.getAttribute('data-surface')).toBe('tv')
  })

  /*
   * The *choice* is mirrored, never the resolution. Storing the resolution
   * would let a window that happened to be wide once pin the layout for good.
   */
  it('mirrors the choice, not the resolution, so auto stays auto', () => {
    applySurface('auto')
    expect(localStorage.getItem(SURFACE_KEY)).toBe('auto')
  })

  it('round-trips through bootSurface', () => {
    applySurface('desktop')
    expect(bootSurface()).toBe('desktop')
  })
})
