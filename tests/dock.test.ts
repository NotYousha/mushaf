import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { Dock, type DockTab } from '../src/ui/Dock'
import { stringsFor } from '../src/i18n'

/**
 * The dock drawing itself in as you read down the list.
 *
 * Two things about it were wrong in ways nobody could see from the code. It
 * was gated on something playing, so on a fresh list — which is where anyone
 * meets it — scrolling did nothing at all. And what it did when it did fire
 * changed the dock's height, which is published as --dock-h and reserved as
 * padding under the list: a reader at the end of a surah had the words pulled
 * out from under them by the bar politely making room.
 *
 * Both are held here rather than left to the eye, because both look like
 * nothing on a desktop and like a fault on a phone.
 */

const TABS: DockTab[] = [
  { id: 'home', label: 'Home', icon: null, onSelect: () => {} },
  { id: 'quran', label: 'Quran', icon: null, onSelect: () => {} },
]

const NOW = {
  title: 'الفَاتِحَة',
  reciter: 'Yasser Al-Dosari',
  reciterId: 'dosari',
  artwork: null,
  playing: true,
}

/** Callbacks handed to the ResizeObserver the dock builds, so a test can fire them. */
let observers: ResizeObserverCallback[] = []
let root: Root | null = null
let host: HTMLDivElement | null = null

beforeEach(() => {
  observers = []
  // jsdom has no ResizeObserver, and the dock skips publishing without one.
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    constructor(cb: ResizeObserverCallback) {
      observers.push(cb)
    }
    observe() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  document.documentElement.style.removeProperty('--dock-h')
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  host?.remove()
  host = null
})

/**
 * The dock, mounted over a scroller whose scrollTop a test can move — jsdom
 * lays nothing out, so both that and the dock's own height are stood in for.
 */
function mount(now: typeof NOW | null) {
  host = document.createElement('div')
  document.body.append(host)
  const scroller = document.createElement('div')
  document.body.append(scroller)
  let y = 0
  Object.defineProperty(scroller, 'scrollTop', { get: () => y })

  root = createRoot(host)
  act(() => {
    root!.render(
      createElement(Dock, {
        t: stringsFor('en'),
        tabs: TABS,
        active: 'quran',
        now,
        onOpenPlayer: () => {},
        onToggle: () => {},
        onNext: () => {},
        scroller: { current: scroller },
      }),
    )
  })

  const dock = host.querySelector('.dock') as HTMLElement
  return {
    dock,
    /** Move the list and let the dock's rAF-deferred handler run. */
    async scrollTo(next: number) {
      y = next
      await act(async () => {
        scroller.dispatchEvent(new Event('scroll'))
        await new Promise((r) => setTimeout(r, 32))
      })
    },
    /** Say how tall the dock now measures, and let its observer see it. */
    async measures(px: number) {
      Object.defineProperty(dock, 'offsetHeight', { value: px, configurable: true })
      await act(async () => {
        for (const cb of observers) cb([], null as unknown as ResizeObserver)
      })
    },
    published: () => document.documentElement.style.getPropertyValue('--dock-h'),
  }
}

describe('the dock contracting', () => {
  it('draws in on the way down with nothing playing', async () => {
    const d = mount(null)
    expect(d.dock.classList.contains('is-tight')).toBe(false)

    await d.scrollTo(400)

    // The old condition was `tight && now`, which made this the one state the
    // contraction never reached: a list, on its own, being read.
    expect(d.dock.classList.contains('is-tight')).toBe(true)
  })

  it('comes back out on the way up and at the top', async () => {
    const d = mount(NOW)
    await d.scrollTo(400)
    expect(d.dock.classList.contains('is-tight')).toBe(true)

    await d.scrollTo(200)
    expect(d.dock.classList.contains('is-tight')).toBe(false)

    await d.scrollTo(600)
    expect(d.dock.classList.contains('is-tight')).toBe(true)
    // Back within the dead zone at the top, where a dock still folded would
    // just look broken.
    await d.scrollTo(0)
    expect(d.dock.classList.contains('is-tight')).toBe(false)
  })

  it('reserves the resting height even while contracted', async () => {
    const d = mount(null)
    await d.measures(70)
    expect(d.published()).toBe('70px')

    await d.scrollTo(400)
    await d.measures(61)

    // 61px is what the contracted dock measures. Publishing it would take 9px
    // out of the padding under the list, and a reader already at the end has
    // their scroll position clamped by that much — the text moves under them
    // in the middle of an ayah, to buy a few pixels of glass.
    expect(d.published()).toBe('70px')

    await d.scrollTo(200)
    await d.measures(70)
    expect(d.published()).toBe('70px')
  })

  it('still makes room when the capsule appears mid-scroll', async () => {
    const d = mount(null)
    await d.measures(70)
    await d.scrollTo(400)

    // Playback starting while contracted grows the dock by a whole row.
    // Growing the reserve moves nothing, so it must not wait for the reader
    // to scroll back up.
    await d.measures(132)
    expect(d.published()).toBe('132px')
  })
})

describe('what the contraction is allowed to touch', () => {
  const css = readFileSync('src/ui/glass.css', 'utf8')
  /** Every declaration under a selector that mentions is-tight. */
  const tightRules = [...css.matchAll(/([^}]*\.is-tight[^{}]*)\{([^}]*)\}/g)].map((m) => ({
    selector: m[1].trim().split('\n').pop()!.trim(),
    body: m[2],
  }))

  it('has rules at all', () => {
    expect(tightRules.length).toBeGreaterThan(0)
  })

  it('never touches the dock.s own padding', () => {
    // That padding is the safe area: the home indicator on a phone, and the
    // notch on whichever edge it lands on in landscape. A contraction that
    // eats into it puts the tabs under the reader's thumb rest.
    for (const r of tightRules) {
      expect(r.body, r.selector).not.toMatch(/^\s*padding/m)
    }
  })

  it('keeps every tab on screen', () => {
    // Folding all but the selected tab away took the pill from 219px to 45px
    // and read as the navigation leaving rather than as the bar making room.
    for (const r of tightRules) {
      expect(r.body, r.selector).not.toMatch(/max-width:\s*0/)
    }
  })

  it('scales the whole contraction by one knob that reduced motion turns off', () => {
    // Every size the contraction changes is multiplied by --tighten, so the
    // media query below is the only place that has to know about any of them.
    const geometry = tightRules.filter((r) => /--tabs-h|--cap-h|--label|opacity/.test(r.body))
    expect(geometry.length).toBeGreaterThan(0)
    for (const r of geometry) expect(r.body, r.selector).toContain('var(--tighten)')

    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {'))
    expect(reduced).toMatch(/--tighten:\s*0/)
  })
})
