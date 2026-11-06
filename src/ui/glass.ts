/**
 * The two things the Liquid Glass material in glass.css cannot do on its
 * own: move its specular highlight, and be turned off.
 *
 * Ported from the ICNL site (components/ui/glass-specular.tsx), minus its
 * SVG refraction filter — see the note at the end of glass.css for why a
 * mushaf does not want one.
 *
 * ---------------------------------------------------------------------------
 * THE HIGHLIGHT
 *
 * Apple's material "picks up specular highlights as the device moves". That
 * is the whole difference between a lens and a gradient overlay: a gradient
 * is painted onto a surface, a highlight is light landing on it, and the eye
 * only believes the second one once it sees the glint answer something.
 *
 * glass.css paints the sheen from two custom properties, `--lg-lx` and
 * `--lg-ly` — where the light is, in percent of the surface. They default to
 * the static 22 / -12, so with this hook unmounted, under reduced motion, or
 * before it attaches, every surface looks exactly as it did before.
 *
 * ---------------------------------------------------------------------------
 * WHY EVERY SURFACE GETS ITS OWN VALUE RATHER THAN ONE GLOBAL LIGHT
 *
 * `--lg-lx` inherits, so a single write on the root element would light the
 * whole app at once and look like the cheap option. Measured on the ICNL
 * build, it is the expensive one: writing an inherited custom property on the
 * root invalidates the style of every element in the document, glass or not.
 * One root write cost 11.6ms of style recalc per frame on a 60-surface page;
 * writing 20 surfaces individually cost 2.0ms. The per-element cost is flat
 * in document size and linear in surfaces touched, which is the curve we
 * want — the root write's curve is the whole DOM, and this app's DOM is a
 * list of a hundred and fourteen rows.
 *
 * So both input paths, pointer and tilt, write per surface. The tilt path
 * writes the same value to each one; that is still cheaper.
 *
 * ---------------------------------------------------------------------------
 * THE THREE THINGS THAT KEEP IT OFF THE MAIN THREAD
 *
 *   1. ONE document-level pointer listener, not one per surface.
 *   2. rAF coalescing. The listener stores coordinates and nothing else, so a
 *      burst of forty moves in one frame produces one write pass.
 *   3. Read-all-then-write-all. `getBoundingClientRect()` interleaved with
 *      `setProperty()` forces a style recalc per element per frame.
 *
 * And the IntersectionObserver, which is the biggest saving of all, because
 * on any screen in this app most glass is off screen or not mounted.
 */

/* -------------------------------------------------------------------------- */
/* The kill switch                                                             */

/**
 * Where the preference lives.
 *
 * localStorage rather than the settings database, for the same reason the
 * theme keeps a write-through copy there: this has to be readable
 * synchronously, and a glass surface that turns itself off a second after
 * launch is worse than one that was never on.
 */
const OFF_KEY = 'mushaf:glass'

/** The class glass.css watches for on the root element. */
const OFF_CLASS = 'lg-off'

const root = () => (typeof document === 'undefined' ? null : document.documentElement)

/** Whether the material is on. Defaults to on. */
export function glassEnabled(): boolean {
  try {
    return window.localStorage.getItem(OFF_KEY) !== 'off'
  } catch {
    /* Site data blocked, or a private window. On is the default. */
    return true
  }
}

/**
 * Turn the whole material off, or back on.
 *
 * Off means `lg-off` on the root element, which reverts every glass surface
 * on the page to an opaque tint with no backdrop-filter — the shape a "reduce
 * transparency" setting takes, and the first thing to reach for when a real
 * device reports jank. Nothing moves and nothing is laid out differently; the
 * surfaces simply stop sampling.
 *
 * The console equivalent, for a device being debugged over a cable:
 *   document.documentElement.classList.add('lg-off')
 */
export function setGlassEnabled(on: boolean): void {
  const el = root()
  if (el) el.classList.toggle(OFF_CLASS, !on)
  try {
    if (on) window.localStorage.removeItem(OFF_KEY)
    else window.localStorage.setItem(OFF_KEY, 'off')
  } catch {
    /* The class is still set for this session; only the memory is lost. */
  }
}

/* -------------------------------------------------------------------------- */
/* Tuning                                                                      */

/** Resting light position — identical to the static gradient in glass.css. */
const REST_X = 22
const REST_Y = -12

/**
 * How far the glint may travel, and how sharply it responds.
 *
 * `tanh` rather than a clamp, and this is the difference between the effect
 * working and not. A linear map with a clamp sends the light to 148% for any
 * surface the pointer is not near, which is far enough off the surface that
 * the highlight disappears entirely. `tanh` asymptotes instead: a distant
 * surface settles with its glint pinned to the edge facing the pointer, which
 * is what a room lit from one side looks like.
 */
const AMP_X = 52
const GAIN_X = 1.8

/**
 * The vertical amplitude is deliberately small — a quarter of the horizontal.
 *
 * The sheen is a 120%-wide ellipse whose centre sits ABOVE the top edge at
 * rest, so what the surface shows is the lower lip of a big soft pool. Let
 * `--lg-ly` reach the middle and the whole ellipse comes into view, and it
 * stops reading as light from above and starts reading as a spotlight
 * following the cursor.
 */
const AMP_Y = 14
const GAIN_Y = 1.4

/**
 * Exponential smoothing toward the target, about 120ms to settle. Not
 * decoration: the pointer arrives in jumps of tens of pixels and the un-eased
 * glint snaps between them, which looks like a flicker rather than a
 * reflection.
 */
const EASE = 0.18

/** Below this the write is skipped, so a settled page costs nothing. */
const EPSILON = 0.25

/** Upright-ish in the hand. Tilt is measured against this, not against flat. */
const TILT_NEUTRAL_BETA = 55
/** Degrees of tilt that map to the full travel. */
const TILT_SPREAD = 26

const SURFACE_SELECTOR = '.lg'

/* -------------------------------------------------------------------------- */

interface Tracked {
  /** Eased, currently written. */
  x: number
  y: number
  /** Where it is heading. */
  tx: number
  ty: number
  /** Cached viewport rect. Re-read only when something could have moved it. */
  l: number
  t: number
  w: number
  h: number
}

/**
 * Whether the platform gates the motion sensors behind a permission call.
 *
 * iOS Safari adds a static `requestPermission` to DeviceOrientationEvent and
 * refuses to deliver events until it has resolved `"granted"`. It MUST be
 * called from a user gesture, and prompting for motion access before the
 * reader has asked for anything is the kind of thing that gets an app's
 * permission requests blocked wholesale. Nothing here calls it.
 */
type PermissionCapableDOE = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

const orientationGate = (): PermissionCapableDOE | null => {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return null
  return window.DeviceOrientationEvent as PermissionCapableDOE
}

/**
 * Ask for the motion sensors. CALL THIS FROM A TAP HANDLER, never from an
 * effect.
 *
 * Returns true if tilt is now available — including on every platform that
 * needs no permission at all (Android, and the WebView build), where it
 * resolves immediately without a prompt. Safe to call more than once.
 *
 * Nothing in this file calls it: the tilt highlight simply stays inert until
 * something does, at which point events start arriving and it comes to life
 * with no further work.
 */
export async function requestGlassTilt(): Promise<boolean> {
  const doe = orientationGate()
  if (!doe) return false
  if (typeof doe.requestPermission !== 'function') return true
  try {
    const state = await doe.requestPermission()
    if (state === 'granted') {
      window.dispatchEvent(new Event('lg-tilt-granted'))
      return true
    }
    return false
  } catch {
    // Throws when called outside a user gesture, and on any engine that has
    // the method but not the sensor. Neither is worth surfacing.
    return false
  }
}

/* -------------------------------------------------------------------------- */

/**
 * Restores the stored kill-switch state and drives `--lg-lx` / `--lg-ly` on
 * every on-screen glass surface.
 *
 * Mount once, from App. Returns nothing: it talks to the DOM directly rather
 * than through React state, because the alternative is a re-render per frame
 * per surface, which is the thing this is trying to avoid.
 *
 * Written as a plain function taking React's useEffect so this module stays
 * importable from a test without a renderer.
 */
export function attachGlass(): () => void {
  const el = root()
  // Server, a test environment without a DOM, or an engine old enough to be
  // missing the observers: the CSS defaults already look like the static
  // build, so doing nothing is correct.
  if (
    !el ||
    typeof window === 'undefined' ||
    typeof IntersectionObserver === 'undefined' ||
    typeof MutationObserver === 'undefined'
  ) {
    return () => {}
  }

  // The stored preference, applied before anything else. One frame of glass
  // on a device that asked for none is the cost of not touching index.html,
  // whose inline boot script is pinned by a CSP hash that a test recomputes.
  el.classList.toggle(OFF_CLASS, !glassEnabled())

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  // A mouse on a desk gets the pointer path; a phone gets tilt. Attaching
  // both invites them to fight over the same two properties, and the loser is
  // whichever wrote last, which flickers.
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')

  /** Every `.lg` currently under observation. */
  let observed = new Set<Element>()
  /** The subset on screen — the only ones ever written to. */
  const visible = new Set<HTMLElement>()
  const tracked = new WeakMap<HTMLElement, Tracked>()

  /**
   * What is driving the light right now.
   *
   * `rest` is its own mode rather than a flag, because "the pointer left the
   * window" and "there is no pointer" need different behaviour: the first has
   * to keep the frame loop running until every glint has eased back, the
   * second must not start it at all.
   */
  let mode: 'idle' | 'pointer' | 'tilt' | 'rest' = 'idle'

  let pointerX = 0
  let pointerY = 0
  let tiltX = REST_X
  let tiltY = REST_Y

  let frame = 0
  let needsMeasure = true
  let rescan = 0
  let running = true

  const clear = (node: HTMLElement) => {
    node.style.removeProperty('--lg-lx')
    node.style.removeProperty('--lg-ly')
    tracked.delete(node)
  }

  const schedule = () => {
    if (!frame && running && mode !== 'idle' && !reduced.matches) {
      frame = requestAnimationFrame(tick)
    }
  }

  function tick() {
    frame = 0
    if (!running || reduced.matches || mode === 'idle') return

    const list = Array.from(visible)
    if (list.length === 0) return

    // READ PHASE. Every rect first. Nothing below this block may touch the
    // DOM's geometry, or each write invalidates the next read and the frame
    // turns into N layouts instead of one.
    if (needsMeasure) {
      for (const node of list) {
        const r = node.getBoundingClientRect()
        let s = tracked.get(node)
        if (!s) {
          s = { x: REST_X, y: REST_Y, tx: REST_X, ty: REST_Y, l: 0, t: 0, w: 1, h: 1 }
          tracked.set(node, s)
        }
        s.l = r.left
        s.t = r.top
        s.w = r.width || 1
        s.h = r.height || 1
      }
      needsMeasure = false
    }

    // WRITE PHASE.
    let settled = true
    for (const node of list) {
      const s = tracked.get(node)
      if (!s) continue

      if (mode === 'pointer') {
        // The pointer is a light source in VIEWPORT space, not a cursor the
        // highlight follows. Each surface asks where that light is relative
        // to its own box, which is why the dock pill and the reader's bar
        // glint on opposite edges rather than moving in lockstep.
        s.tx = 50 + AMP_X * Math.tanh(((pointerX - s.l) / s.w - 0.5) * GAIN_X)
        s.ty = REST_Y + AMP_Y * Math.tanh(((pointerY - s.t) / s.h - 0.5) * GAIN_Y)
      } else if (mode === 'tilt') {
        s.tx = tiltX
        s.ty = tiltY
      } else {
        s.tx = REST_X
        s.ty = REST_Y
      }

      const nx = s.x + (s.tx - s.x) * EASE
      const ny = s.y + (s.ty - s.y) * EASE
      if (Math.abs(nx - s.x) > EPSILON || Math.abs(ny - s.y) > EPSILON) settled = false
      s.x = nx
      s.y = ny
      node.style.setProperty('--lg-lx', nx.toFixed(1))
      node.style.setProperty('--lg-ly', ny.toFixed(1))
    }

    // The loop stops the moment the glints reach their targets. A still
    // pointer costs nothing at all.
    if (settled && mode === 'rest') mode = 'idle'
    else if (!settled) schedule()
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const node = entry.target as HTMLElement
        if (entry.isIntersecting) {
          visible.add(node)
        } else if (visible.delete(node)) {
          // Leave it at the CSS default rather than frozen mid-travel, so it
          // is correct the instant it comes back on screen.
          clear(node)
        }
      }
      needsMeasure = true
      schedule()
    },
    // A little margin, so a surface is already tracking by the time its top
    // edge appears rather than snapping into place on screen.
    { rootMargin: '15%' },
  )

  const scan = () => {
    rescan = 0
    const found = document.querySelectorAll<HTMLElement>(SURFACE_SELECTOR)
    const next = new Set<Element>()
    for (const node of found) {
      next.add(node)
      if (!observed.has(node)) io.observe(node)
    }
    for (const node of observed) {
      if (!next.has(node)) {
        io.unobserve(node)
        visible.delete(node as HTMLElement)
      }
    }
    observed = next
  }

  // Tabs, the reader and the player sheet mount and unmount without this
  // function re-running, so the set of glass surfaces changes underneath it.
  // Coalesced to one rescan per frame: React commits arrive in bursts, and
  // querySelectorAll on every mutation record would be the most expensive
  // thing in the file.
  const mo = new MutationObserver(() => {
    if (!rescan) rescan = requestAnimationFrame(scan)
  })

  const onPointerMove = (e: PointerEvent) => {
    // Touch produces a pointermove on every tap and drag, which would light
    // the surface under the finger and then leave it lit. Tilt is the touch
    // device's input.
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
    pointerX = e.clientX
    pointerY = e.clientY
    mode = 'pointer'
    schedule()
  }

  const onPointerLeave = (e: PointerEvent) => {
    // Pointer out of the WINDOW, not merely off one element — a null
    // relatedTarget is the only signal for that.
    if (e.relatedTarget) return
    mode = 'rest'
    schedule()
  }

  const onOrientation = (e: DeviceOrientationEvent) => {
    if (e.beta === null && e.gamma === null) return
    mode = 'tilt'
    tiltX = 50 + AMP_X * Math.tanh((e.gamma ?? 0) / TILT_SPREAD)
    tiltY =
      REST_Y + AMP_Y * Math.tanh(((e.beta ?? TILT_NEUTRAL_BETA) - TILT_NEUTRAL_BETA) / TILT_SPREAD)
    schedule()
  }

  const invalidate = () => {
    needsMeasure = true
    schedule()
  }

  let tiltAttached = false

  const attachTilt = () => {
    // No permission call here, ever. See requestGlassTilt above.
    if (tiltAttached || !orientationGate()) return
    window.addEventListener('deviceorientation', onOrientation, { passive: true })
    tiltAttached = true
  }

  const attach = () => {
    if (reduced.matches) return
    if (finePointer.matches) {
      document.addEventListener('pointermove', onPointerMove, { passive: true })
      document.addEventListener('pointerout', onPointerLeave, { passive: true })
    } else {
      attachTilt()
      window.addEventListener('lg-tilt-granted', attachTilt)
    }
    window.addEventListener('scroll', invalidate, { passive: true, capture: true })
    window.addEventListener('resize', invalidate, { passive: true })
    mo.observe(document.body, { childList: true, subtree: true })
    scan()
  }

  const detach = () => {
    document.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerout', onPointerLeave)
    window.removeEventListener('deviceorientation', onOrientation)
    window.removeEventListener('lg-tilt-granted', attachTilt)
    window.removeEventListener('scroll', invalidate, { capture: true })
    window.removeEventListener('resize', invalidate)
    tiltAttached = false
    mo.disconnect()
    if (rescan) cancelAnimationFrame(rescan)
    if (frame) cancelAnimationFrame(frame)
    rescan = 0
    frame = 0
    for (const node of visible) clear(node)
    for (const node of observed) io.unobserve(node)
    observed = new Set()
    visible.clear()
    mode = 'idle'
  }

  // Reduced motion is honoured live, not only at mount. Turning it on while
  // the app is open gets the static sheen back immediately, with the inline
  // properties removed so the CSS default resumes — not a frozen last frame.
  const onPreferenceChange = () => {
    detach()
    running = !reduced.matches
    if (running) attach()
  }

  running = !reduced.matches
  if (running) attach()

  reduced.addEventListener('change', onPreferenceChange)
  finePointer.addEventListener('change', onPreferenceChange)

  return () => {
    running = false
    reduced.removeEventListener('change', onPreferenceChange)
    finePointer.removeEventListener('change', onPreferenceChange)
    detach()
    io.disconnect()
  }
}
