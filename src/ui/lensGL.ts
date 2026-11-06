/**
 * The WebGL selection lens for the dock's tabs.
 *
 * The same shader as the ICNL Lens Test artifact: html2canvas takes a picture
 * of the tab labels, and a rounded-rect SDF bends that picture under the lens.
 * The bend grows with edge² toward the rim, red and blue bend 10% more and
 * less than green there (the dispersion fringe a real lens shows where bent
 * text meets its edge), and light catches the top-left rim. Between tabs the
 * lens slides and stretches along its travel, keeping its volume.
 *
 * It is chrome only. The dock floats over the surah list and the translation,
 * never over an ayah being read, so bending what is behind it costs nothing
 * a reader needs; the picture it bends is the tab labels, not the page.
 *
 * Everything degrades to the CSS `.lg-chip` already in glass.css: no WebGL,
 * the material switched off (`lg-off`), reduced motion, a lost context, or
 * html2canvas failing to load all leave the nav without its `gl` class, and
 * the CSS chip is what shows. The canvas only draws while the lens moves or
 * the picture changes, so a still dock costs nothing per frame.
 */

const VS =
  'attribute vec2 p; varying vec2 uv; void main(){ uv = p * 0.5 + 0.5; uv.y = 1.0 - uv.y; gl_Position = vec4(p, 0.0, 1.0); }'

/*
 * Output is premultiplied and mostly opaque inside the lens, transparent
 * outside it. The lens has to hide the unbent labels the DOM still draws
 * underneath — otherwise every glyph near the rim shows twice — so its body
 * is the chip's own fill at high alpha with the bent picture over it.
 */
const FS = `precision highp float;
varying vec2 uv;
uniform sampler2D t; uniform vec2 view; uniform vec2 texPx; uniform float sc;
uniform vec4 R; uniform float rad; uniform float depth;
uniform vec3 fill; uniform float fillA; uniform float rimK;
float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
vec4 px(vec2 v){ vec2 s = v * sc / texPx; if (s.x<0.0||s.y<0.0||s.x>1.0||s.y>1.0) return vec4(0.0); return texture2D(t, s); }
float shape(vec2 v){ return sdRound(v - R.xy, R.zw, rad); }
void main(){
  vec2 v = uv * view; float d = shape(v);
  float aa = clamp(0.5 - d, 0.0, 1.0);
  if (aa <= 0.0) { gl_FragColor = vec4(0.0); return; }
  vec2 e = vec2(1.0, 0.0);
  vec2 n = normalize(vec2(shape(v+e.xy)-shape(v-e.xy), shape(v+e.yx)-shape(v-e.yx)) + 1e-5);
  float edge = clamp(1.0 + d / depth, 0.0, 1.0);
  vec2 bend = -n * pow(edge, 2.5) * depth * 0.7;
  vec4 c = px(v + bend);
  float r = px(v + bend * 1.07).r, b = px(v + bend * 0.93).b;
  c.r = mix(c.r, r, edge); c.b = mix(c.b, b, edge);
  vec4 col = c + vec4(fill * fillA, fillA) * (1.0 - c.a);
  float lightDir = clamp(dot(n, normalize(vec2(-0.6, -0.8))), 0.0, 1.0);
  float rim = smoothstep(0.75, 1.0, edge) * (0.10 + 0.36 * lightDir) * rimK;
  col.a = min(1.0, col.a + rim * 0.5);
  col.rgb = min(col.rgb + rim, vec3(col.a));
  gl_FragColor = col * aa;
}`

/**
 * What html2canvas may copy when photographing `target`.
 *
 * It clones the WHOLE document before drawing one element, and waits up to
 * 15 s for every image in the clone to load. On the surah list, full of
 * artwork, that meant a picture that never arrived. Only the target, the
 * elements that contain it, and the page's styles are worth cloning.
 */
const KEEP = new Set(['HTML', 'HEAD', 'BODY', 'STYLE', 'LINK', 'META', 'TITLE'])
const onlyPath = (target: HTMLElement) => (x: Element) =>
  x.tagName === 'CANVAS' || (!KEEP.has(x.tagName) && !x.contains(target) && !target.contains(x))

type GL = { U: (name: string) => WebGLUniformLocation | null }

/** Compile the lens program into a context and bind the full-screen quad. */
function setupGL(g: WebGLRenderingContext): GL | null {
  const sh = (type: number, src: string) => {
    const x = g.createShader(type)!
    g.shaderSource(x, src)
    g.compileShader(x)
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
  const U = (nm: string) => g.getUniformLocation(prog, nm)
  g.bindTexture(g.TEXTURE_2D, g.createTexture())
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE)
  g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
  return { U }
}

type Rect = { cx: number; cy: number; hw: number; hh: number }

export type Lens = {
  /** The selected tab changed, or its label did: re-take the picture and move. */
  update(): void
  dispose(): void
}

const SLIDE_MS = 420

export function attachLens(nav: HTMLElement): Lens | null {
  if (typeof window === 'undefined') return null
  const root = document.documentElement
  if (root.classList.contains('lg-off')) return null
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null

  const cv = document.createElement('canvas')
  cv.className = 'lens-gl'
  cv.setAttribute('aria-hidden', 'true')
  let g: WebGLRenderingContext | null = null
  try {
    g = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false })
  } catch {
    /* jsdom, or a browser with WebGL disabled */
  }
  if (!g) return null

  const gl = setupGL(g)
  if (!gl) return null
  const U = gl.U

  nav.appendChild(cv)

  let disposed = false
  let ready = false
  let texW = 1
  let texH = 1
  let sc = 1
  let dpr = 1
  let shotSeq = 0
  /** Where the lens is drawn now, and the slide it is part-way through. */
  let at: Rect | null = null
  let from: Rect | null = null
  let to: Rect | null = null
  let t0 = 0
  let raf = 0

  const off = () => {
    ready = false
    nav.classList.remove('gl')
  }

  const target = (): Rect | null => {
    const tab = nav.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!tab) return null
    const n = nav.getBoundingClientRect()
    const r = tab.getBoundingClientRect()
    const cx = r.left - n.left + r.width / 2
    const cy = r.top - n.top + r.height / 2
    // Kept inside the pill: the end tabs sit against its rounded ends, and a
    // lens wider than its tab would otherwise be cut off by the pill's edge.
    const inset = 3
    let hw = Math.max(r.width / 2 + 4, (r.height / 2) * 1.35)
    const hh = Math.min(r.height / 2 + 1, n.height / 2 - inset)
    const left = Math.max(cx - hw, inset)
    const right = Math.min(cx + hw, n.width - inset)
    hw = (right - left) / 2
    return {
      cx: (left + right) / 2,
      cy,
      hw,
      hh,
    }
  }

  function draw(r: Rect) {
    const W = nav.clientWidth
    const H = nav.clientHeight
    const pw = Math.round(W * dpr)
    const ph = Math.round(H * dpr)
    if (cv.width !== pw || cv.height !== ph) {
      cv.width = pw
      cv.height = ph
    }
    // The chip's own fill, so the lens is the same colour in either theme.
    const tint = getComputedStyle(nav).getPropertyValue('--lg-tint').trim().split(/[\s,]+/).map(Number)
    const [fr, fg, fb] = tint.length === 3 && tint.every((x) => !Number.isNaN(x)) ? tint : [255, 255, 255]
    g!.viewport(0, 0, pw, ph)
    g!.clearColor(0, 0, 0, 0)
    g!.clear(g!.COLOR_BUFFER_BIT)
    g!.uniform2f(U('view'), W, H)
    g!.uniform2f(U('texPx'), texW, texH)
    g!.uniform1f(U('sc'), sc)
    g!.uniform4f(U('R'), r.cx, r.cy, r.hw, r.hh)
    g!.uniform1f(U('rad'), Math.min(r.hw, r.hh))
    g!.uniform1f(U('depth'), Math.min(r.hw, r.hh) * 0.42)
    g!.uniform3f(U('fill'), fr / 255, fg / 255, fb / 255)
    g!.uniform1f(U('fillA'), 0.86)
    g!.uniform1f(U('rimK'), 1)
    g!.drawArrays(g!.TRIANGLE_STRIP, 0, 4)
  }

  function frame(now: number) {
    raf = 0
    if (disposed || !ready || !to) return
    if (!from || !at) {
      at = to
      draw(at)
      return
    }
    const k = Math.min(1, (now - t0) / SLIDE_MS)
    // easeOutBack: a little past, then settles — the lens has mass.
    const c1 = 1.4
    const e = 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2)
    const lerp = (a: number, b: number) => a + (b - a) * e
    // Stretch along the travel and thin across it, keeping the area.
    const travel = Math.abs(to.cx - from.cx)
    const sx = 1 + Math.min(0.3, travel / 400) * Math.sin(Math.PI * k)
    at = {
      cx: lerp(from.cx, to.cx),
      cy: lerp(from.cy, to.cy),
      hw: lerp(from.hw, to.hw) * sx,
      hh: lerp(from.hh, to.hh) / Math.sqrt(sx),
    }
    draw(at)
    if (k < 1) raf = requestAnimationFrame(frame)
    else {
      at = to
      from = null
      draw(at)
    }
  }

  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame)
  }

  async function snap() {
    const seq = ++shotSeq
    try {
      const { default: html2canvas } = await import('html2canvas')
      await document.fonts.ready
      if (disposed || seq !== shotSeq) return
      dpr = window.devicePixelRatio || 1
      sc = Math.min(4, Math.ceil(dpr * 2)) // supersampled, so the bend resamples crisply
      const shot = await html2canvas(nav, {
        scale: sc,
        backgroundColor: null,
        logging: false,
        imageTimeout: 3000,
        ignoreElements: onlyPath(nav),
        // The picture is of the labels only: no pill, no rim, no chip fill.
        onclone: (_doc, el) => el.classList.add('lens-snap'),
      })
      if (disposed || seq !== shotSeq) return
      texW = shot.width
      texH = shot.height
      g!.texImage2D(g!.TEXTURE_2D, 0, g!.RGBA, g!.RGBA, g!.UNSIGNED_BYTE, shot)
      ready = true
      nav.classList.add('gl')
      const next = target()
      if (next) to = next
      kick()
    } catch {
      off()
    }
  }

  function update() {
    const next = target()
    if (!next) return
    if (at && ready) {
      from = { ...at }
      t0 = performance.now()
    }
    to = next
    kick()
    // The selected label changes colour, so the picture is out of date.
    void snap()
  }

  /*
   * The dock draws in while scrolling: the labels shrink and the pill loses
   * height. The picture no longer matches, so the CSS chip shows for the
   * moment of the resize and the lens comes back on the settled layout.
   */
  let resizeTimer = 0
  const ro =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          if (!ready && !at) return
          off()
          window.clearTimeout(resizeTimer)
          resizeTimer = window.setTimeout(() => {
            at = null
            from = null
            to = target()
            void snap()
          }, 260)
        })
  ro?.observe(nav)

  // A theme change recolours the labels.
  const mo = new MutationObserver(() => void snap())
  mo.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] })

  const lost = (e: Event) => {
    e.preventDefault()
    off()
  }
  cv.addEventListener('webglcontextlost', lost)

  update()

  return {
    update,
    dispose() {
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      window.clearTimeout(resizeTimer)
      ro?.disconnect()
      mo.disconnect()
      cv.removeEventListener('webglcontextlost', lost)
      off()
      cv.remove()
      g?.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}

/* =========================================================================
 * Glass surfaces: a round button, the search field, the dock pill.
 *
 * The same lens, sized to the whole element and standing still. It
 * photographs the element's own icons once, hides the originals, and draws
 * them back bent at the rim with the colour fringe and the catch-light, over
 * whatever material the CSS already paints. A surface whose content sits well
 * clear of its edge (the dock pill) shows only the rim, which is what glass
 * looks like there.
 *
 * Text a person types is never photographed. An `input` is left out of the
 * picture and kept live above the canvas, so typing costs nothing and the
 * caret is always the real one.
 * ========================================================================= */

export function attachSurface(el: HTMLElement): (() => void) | null {
  if (typeof window === 'undefined') return null
  const root = document.documentElement
  if (root.classList.contains('lg-off')) return null
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null

  const cv = document.createElement('canvas')
  cv.className = 'surface-gl'
  cv.setAttribute('aria-hidden', 'true')
  let g: WebGLRenderingContext | null = null
  try {
    g = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false })
  } catch {
    /* jsdom, or a browser with WebGL disabled */
  }
  if (!g) return null
  const gl = setupGL(g)
  if (!gl) return null
  const U = gl.U
  el.appendChild(cv)

  let disposed = false
  let seq = 0

  function draw(texW: number, texH: number, sc: number, dpr: number) {
    const W = el.clientWidth
    const H = el.clientHeight
    const pw = Math.round(W * dpr)
    const ph = Math.round(H * dpr)
    cv.width = pw
    cv.height = ph
    const hw = W / 2
    const hh = H / 2
    const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
    const rad = Math.min(hw, hh, r)
    g!.viewport(0, 0, pw, ph)
    g!.clearColor(0, 0, 0, 0)
    g!.clear(g!.COLOR_BUFFER_BIT)
    g!.uniform2f(U('view'), W, H)
    g!.uniform2f(U('texPx'), texW, texH)
    g!.uniform1f(U('sc'), sc)
    g!.uniform4f(U('R'), hw, hh, hw, hh)
    g!.uniform1f(U('rad'), rad)
    g!.uniform1f(U('depth'), Math.min(hw, hh) * 0.5)
    g!.uniform3f(U('fill'), 0, 0, 0)
    g!.uniform1f(U('fillA'), 0)
    g!.uniform1f(U('rimK'), 0.8)
    g!.drawArrays(g!.TRIANGLE_STRIP, 0, 4)
  }

  async function snap() {
    const mine = ++seq
    try {
      const { default: html2canvas } = await import('html2canvas')
      await document.fonts.ready
      if (disposed || mine !== seq || !el.isConnected || el.clientWidth === 0) return
      el.classList.remove('sgl')
      const dpr = window.devicePixelRatio || 1
      const sc = Math.min(4, Math.ceil(dpr * 2))
      if (el.dataset.glass === 'rim') {
        // Rim only: nothing to photograph, so no html2canvas at all.
        g!.texImage2D(g!.TEXTURE_2D, 0, g!.RGBA, 1, 1, 0, g!.RGBA, g!.UNSIGNED_BYTE, new Uint8Array(4))
        draw(1, 1, sc, dpr)
        el.classList.add('sgl')
        return
      }
      const shot = await html2canvas(el, {
        scale: sc,
        backgroundColor: null,
        logging: false,
        imageTimeout: 3000,
        ignoreElements: (x) => x.tagName === 'INPUT' || onlyPath(el)(x),
        onclone: (_doc, c) => c.classList.add('lens-snap'),
      })
      if (disposed || mine !== seq) return
      g!.texImage2D(g!.TEXTURE_2D, 0, g!.RGBA, g!.RGBA, g!.UNSIGNED_BYTE, shot)
      draw(shot.width, shot.height, sc, dpr)
      el.classList.add('sgl')
    } catch (e) {
      console.warn('glass surface', e)
      el.classList.remove('sgl')
    }
  }

  let timer = 0
  const later = () => {
    el.classList.remove('sgl')
    window.clearTimeout(timer)
    timer = window.setTimeout(() => void snap(), 260)
  }
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(later)
  ro?.observe(el)
  const mo = new MutationObserver(later)
  mo.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] })
  // A label that changes (the download size counting down) makes the picture
  // stale. Mutations to the canvas itself, and to typed text, do not count.
  const own = new MutationObserver((list) => {
    if (list.some((m) => m.target !== cv && !(m.target instanceof HTMLInputElement) && ![...m.addedNodes, ...m.removedNodes].includes(cv))) later()
  })
  own.observe(el, { childList: true, subtree: true, characterData: true })
  const lost = (e: Event) => {
    e.preventDefault()
    el.classList.remove('sgl')
  }
  cv.addEventListener('webglcontextlost', lost)

  void snap()

  return () => {
    disposed = true
    window.clearTimeout(timer)
    ro?.disconnect()
    mo.disconnect()
    own.disconnect()
    cv.removeEventListener('webglcontextlost', lost)
    el.classList.remove('sgl')
    cv.remove()
    g?.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

/**
 * Glass every surface marked `data-glass` as it appears, and let it go as it
 * leaves. One observer for the app, so a component only has to carry the
 * attribute.
 */
export function watchSurfaces(): () => void {
  if (typeof window === 'undefined') return () => {}
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
