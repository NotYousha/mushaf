/**
 * WebGL Liquid Glass: the rim of the ICNL Lens Test shader, with nothing
 * photographed.
 *
 * The first version bent a picture of each surface's labels, taken with
 * html2canvas. That picture cost a long main-thread stall every time it was
 * retaken — on each tab tap, exactly while the lens was meant to be sliding,
 * and on every resize as the dock drew in while scrolling — and on a phone
 * that was the lag. So nothing is photographed any more. The GPU draws the
 * glass itself: a rounded-rect SDF whose rim catches light from the top
 * left, splits it into a thin red/blue dispersion fringe (red tight to the
 * edge, blue a little further in), and darkens the shaded side. The live
 * DOM content stays where it is and is never copied, so typing, progress
 * text and artwork changes cost nothing.
 *
 * Two kinds of glass:
 *   attachLens(nav)   the dock's selection lens: a capsule that slides and
 *                     stretches between tabs, drawn under the live labels.
 *                     It redraws only while it moves (420 ms per tap).
 *   watchSurfaces()   a rim on every `data-glass` element (the search bar,
 *                     the dock pill, the play controls). Drawn once, and
 *                     again only when the element's size or the theme
 *                     changes, coalesced into one frame.
 *
 * Either one stands down to the CSS glass with no WebGL, with the material
 * switched off (`lg-off`), or under reduced motion.
 */

const VS =
  'attribute vec2 p; varying vec2 uv; void main(){ uv = p * 0.5 + 0.5; uv.y = 1.0 - uv.y; gl_Position = vec4(p, 0.0, 1.0); }'

/* Premultiplied output; transparent outside the shape. */
const FS = `precision mediump float;
varying vec2 uv;
uniform vec2 view; uniform vec4 R; uniform float rad; uniform float band;
uniform vec3 fill; uniform float fillA; uniform float rimK;
float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
float shape(vec2 v){ return sdRound(v - R.xy, R.zw, rad); }
void main(){
  vec2 v = uv * view; float d = shape(v);
  float aa = clamp(0.5 - d, 0.0, 1.0);
  if (aa <= 0.0) { gl_FragColor = vec4(0.0); return; }
  vec2 e = vec2(1.0, 0.0);
  vec2 n = normalize(vec2(shape(v+e.xy)-shape(v-e.xy), shape(v+e.yx)-shape(v-e.yx)) + 1e-5);
  float t = clamp(1.0 + d / band, 0.0, 1.0);
  float lit = clamp(dot(n, normalize(vec2(-0.6, -0.8))), 0.0, 1.0);
  float L = (0.14 + 0.62 * lit) * rimK;
  // A white catch-light with a thin dispersion split: red tight to the
  // edge, blue reaching a little further in. Red reaching further in, as
  // first tuned, washed the whole rim amber.
  vec3 fringe = vec3(pow(t, 7.0), pow(t, 6.0), pow(t, 5.0)) * L;
  float shade = pow(t, 3.0) * 0.22 * (1.0 - lit) * rimK;
  float a = min(1.0, fillA + max(fringe.r, fringe.b) * 0.85 + shade);
  vec3 rgb = min(fill * fillA + fringe, vec3(a));
  gl_FragColor = vec4(rgb, a) * aa;
}`

type Ctx = {
  g: WebGLRenderingContext
  U: (name: string) => WebGLUniformLocation | null
  cv: HTMLCanvasElement
}

function makeCtx(className: string): Ctx | null {
  if (typeof window === 'undefined') return null
  if (document.documentElement.classList.contains('lg-off')) return null
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null
  const cv = document.createElement('canvas')
  cv.className = className
  cv.setAttribute('aria-hidden', 'true')
  let g: WebGLRenderingContext | null = null
  try {
    g = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false })
  } catch {
    /* jsdom, or WebGL disabled */
  }
  if (!g) return null
  const sh = (type: number, src: string) => {
    const x = g!.createShader(type)!
    g!.shaderSource(x, src)
    g!.compileShader(x)
    return x
  }
  const prog = g.createProgram()!
  g.attachShader(prog, sh(g.VERTEX_SHADER, VS))
  g.attachShader(prog, sh(g.FRAGMENT_SHADER, FS))
  g.linkProgram(prog)
  if (!g.getProgramParameter(prog, g.LINK_STATUS)) return null
  g.useProgram(prog)
  g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer())
  g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW)
  const loc = g.getAttribLocation(prog, 'p')
  g.enableVertexAttribArray(loc)
  g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0)
  const cache = new Map<string, WebGLUniformLocation | null>()
  const U = (nm: string) => {
    if (!cache.has(nm)) cache.set(nm, g!.getUniformLocation(prog, nm))
    return cache.get(nm) ?? null
  }
  return { g, U, cv }
}

type Shape = { cx: number; cy: number; hw: number; hh: number; rad: number }
type Look = { fill: [number, number, number]; fillA: number; rimK: number; band: number }

/** Size the canvas to its box (CSS px × dpr) and draw one shape. */
function paint(c: Ctx, W: number, H: number, s: Shape, look: Look) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
  const pw = Math.max(1, Math.round(W * dpr))
  const ph = Math.max(1, Math.round(H * dpr))
  const { g, U, cv } = c
  if (cv.width !== pw || cv.height !== ph) {
    cv.width = pw
    cv.height = ph
  }
  g.viewport(0, 0, pw, ph)
  g.clearColor(0, 0, 0, 0)
  g.clear(g.COLOR_BUFFER_BIT)
  g.uniform2f(U('view'), W, H)
  g.uniform4f(U('R'), s.cx, s.cy, s.hw, s.hh)
  g.uniform1f(U('rad'), Math.min(s.hw, s.hh, s.rad))
  g.uniform1f(U('band'), look.band)
  g.uniform3f(U('fill'), look.fill[0], look.fill[1], look.fill[2])
  g.uniform1f(U('fillA'), look.fillA)
  g.uniform1f(U('rimK'), look.rimK)
  g.drawArrays(g.TRIANGLE_STRIP, 0, 4)
}

/** The glass tint for this theme, as 0–1 RGB, read once per theme. */
function tintOf(el: Element): [number, number, number] {
  const v = getComputedStyle(el).getPropertyValue('--lg-tint').trim().split(/[\s,]+/).map(Number)
  return v.length === 3 && v.every((x) => !Number.isNaN(x))
    ? [v[0] / 255, v[1] / 255, v[2] / 255]
    : [1, 1, 1]
}

/** Observe theme switches only, not every class change on the root. */
function onTheme(cb: () => void) {
  const root = document.documentElement
  let last = root.getAttribute('data-theme')
  const mo = new MutationObserver(() => {
    const now = root.getAttribute('data-theme')
    if (now !== last) {
      last = now
      cb()
    }
  })
  mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
  return () => mo.disconnect()
}

/* ========================================================================= */
/* The dock's sliding selection lens                                          */

export type Lens = {
  /** The selected tab changed: slide there. */
  update(): void
  dispose(): void
}

const SLIDE_MS = 420

export function attachLens(nav: HTMLElement): Lens | null {
  const c = makeCtx('lens-gl')
  if (!c) return null
  nav.prepend(c.cv)

  let fill = tintOf(nav)
  let at: Shape | null = null
  let from: Shape | null = null
  let to: Shape | null = null
  let t0 = 0
  let raf = 0
  let disposed = false

  const target = (): Shape | null => {
    const tab = nav.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!tab) return null
    const W = nav.clientWidth
    const H = nav.clientHeight
    const cx = tab.offsetLeft + tab.offsetWidth / 2
    const inset = 3
    // A capsule, wider than tall like the native tab lens, kept inside the
    // pill so the end tabs are not cut off by its rounded ends.
    const hh = Math.min(tab.offsetHeight / 2 + 1, H / 2 - inset)
    const want = Math.max(tab.offsetWidth / 2 + 4, hh * 1.35)
    const left = Math.max(cx - want, inset)
    const right = Math.min(cx + want, W - inset)
    return { cx: (left + right) / 2, cy: H / 2, hw: (right - left) / 2, hh, rad: hh }
  }

  const look = (): Look => ({ fill, fillA: 0.3, rimK: 1, band: 9 })

  function frame(now: number) {
    raf = 0
    if (disposed || !to) return
    const W = nav.clientWidth
    const H = nav.clientHeight
    if (!from || !at) {
      at = to
      paint(c!, W, H, at, look())
      return
    }
    const k = Math.min(1, (now - t0) / SLIDE_MS)
    // easeOutBack: a little past, then settles. The lens has mass.
    const c1 = 1.4
    const e = 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2)
    const lerp = (a: number, b: number) => a + (b - a) * e
    // Stretch along the travel and thin across it, keeping the area.
    const sx = 1 + Math.min(0.3, Math.abs(to.cx - from.cx) / 400) * Math.sin(Math.PI * k)
    const hh = lerp(from.hh, to.hh) / Math.sqrt(sx)
    at = { cx: lerp(from.cx, to.cx), cy: lerp(from.cy, to.cy), hw: lerp(from.hw, to.hw) * sx, hh, rad: hh }
    paint(c!, W, H, at, look())
    if (k < 1) raf = requestAnimationFrame(frame)
    else {
      at = to
      from = null
      paint(c!, W, H, at, look())
    }
  }
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame)
  }

  function update() {
    const next = target()
    if (!next) return
    if (at) {
      from = { ...at }
      t0 = performance.now()
    }
    to = next
    kick()
  }

  // The dock draws in while scrolling. Follow it once it has settled; in
  // between, CSS stretches the canvas with the pill.
  let settle = 0
  const ro =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          window.clearTimeout(settle)
          settle = window.setTimeout(() => {
            const next = target()
            if (!next) return
            to = next
            if (!from) at = null
            kick()
          }, 140)
        })
  ro?.observe(nav)
  const stopTheme = onTheme(() => {
    fill = tintOf(nav)
    at = null
    kick()
  })
  const lost = (e: Event) => {
    e.preventDefault()
    nav.classList.remove('gl')
  }
  c.cv.addEventListener('webglcontextlost', lost)

  nav.classList.add('gl')
  update()

  return {
    update,
    dispose() {
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      window.clearTimeout(settle)
      ro?.disconnect()
      stopTheme()
      c.cv.removeEventListener('webglcontextlost', lost)
      nav.classList.remove('gl')
      c.cv.remove()
      c.g.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}

/* ========================================================================= */
/* Glass rims on `data-glass` surfaces                                        */

export function attachSurface(el: HTMLElement): (() => void) | null {
  const c = makeCtx('surface-gl')
  if (!c) return null
  el.appendChild(c.cv)

  let raf = 0
  let radius = 0
  const draw = () => {
    raf = 0
    const W = el.clientWidth
    const H = el.clientHeight
    if (W === 0 || H === 0) return
    paint(
      c,
      W,
      H,
      { cx: W / 2, cy: H / 2, hw: W / 2, hh: H / 2, rad: radius },
      { fill: [0, 0, 0], fillA: 0, rimK: 0.9, band: Math.min(10, H / 3) },
    )
    el.classList.add('sgl')
  }
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(draw)
  }
  const measure = () => {
    radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
  }
  measure()

  /*
   * Redraw once a resize has settled, not on every frame of it. The dock
   * draws in while scrolling, and re-allocating a canvas and drawing it
   * each frame of that 220 ms was the long stalls measured on the surah
   * list. Meanwhile the canvas is stretched by CSS, which nobody sees.
   */
  let settle = 0
  const ro =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          window.clearTimeout(settle)
          settle = window.setTimeout(kick, 140)
        })
  ro?.observe(el)
  const stopTheme = onTheme(() => {
    measure()
    kick()
  })
  const lost = (e: Event) => {
    e.preventDefault()
    el.classList.remove('sgl')
  }
  c.cv.addEventListener('webglcontextlost', lost)
  kick()

  return () => {
    if (raf) cancelAnimationFrame(raf)
    window.clearTimeout(settle)
    ro?.disconnect()
    stopTheme()
    c.cv.removeEventListener('webglcontextlost', lost)
    el.classList.remove('sgl')
    c.cv.remove()
    c.g.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

/**
 * Glass every `data-glass` surface as it appears and release it as it goes.
 * One observer for the app, rAF-coalesced, so a component only has to carry
 * the attribute.
 */
export function watchSurfaces(): () => void {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  const live = new Map<HTMLElement, () => void>()
  const scan = () => {
    document.querySelectorAll<HTMLElement>('[data-glass]').forEach((el) => {
      if (live.has(el)) return
      const stop = attachSurface(el)
      if (stop) live.set(el, stop)
    })
    for (const [el, stop] of live) {
      if (!el.isConnected) {
        stop()
        live.delete(el)
      }
    }
  }
  let pending = 0
  const mo = new MutationObserver(() => {
    if (!pending) pending = requestAnimationFrame(() => ((pending = 0), scan()))
  })
  mo.observe(document.body, { childList: true, subtree: true })
  scan()
  return () => {
    mo.disconnect()
    if (pending) cancelAnimationFrame(pending)
    for (const stop of live.values()) stop()
    live.clear()
  }
}
