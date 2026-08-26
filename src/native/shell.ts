/**
 * Talking to a native shell, when there is one.
 *
 * Apple's Liquid Glass is native-only: no web view can reach `.glassEffect()`
 * or `UIGlassEffect`, and no CSS approximates its refraction honestly. The way
 * to have the real thing is to let a native tab bar own the bottom of the
 * screen and have the web content stand down — which is what this exists for.
 *
 * Running in a browser, `isNativeShell()` is false and the app draws its own
 * glass dock. Running inside a native wrapper that has declared itself, the
 * web dock hides, the app pads itself clear of the native bar, and the state
 * the native side needs — which tab is selected, what is playing — is pushed
 * across so its tab bar and bottom accessory can render it.
 *
 * The contract is deliberately tiny and one-way. Nothing here waits on the
 * native side, so the app is never blocked by a shell that is missing or a
 * version that has not caught up.
 */

export type NowPlaying = {
  surah: number
  title: string
  reciter: string
  artwork: string | null
  playing: boolean
  /** 0–1, for the accessory's progress line. */
  progress: number
}

type Bridge = {
  /** Set by the shell so the web side knows to stand down. */
  ready?: boolean
  /** Height in CSS pixels the native bar occupies at the bottom. */
  insetBottom?: number
  postMessage?: (message: string) => void
}

declare global {
  interface Window {
    /** Injected by the native wrapper before the app boots. */
    MushafNative?: Bridge
    webkit?: { messageHandlers?: Record<string, { postMessage: (m: unknown) => void }> }
  }
}

const bridge = (): Bridge | null =>
  typeof window !== 'undefined' && window.MushafNative?.ready ? window.MushafNative : null

export const isNativeShell = () => bridge() !== null

/**
 * How much room the native chrome needs at the bottom.
 *
 * Published as a custom property rather than read at each call site, so the
 * layout answers to one number and a shell that resizes its bar only has to
 * set it again.
 */
export function applyNativeInsets() {
  if (typeof document === 'undefined') return
  const b = bridge()
  const root = document.documentElement
  root.classList.toggle('is-native', b !== null)
  root.style.setProperty('--native-bottom', b ? `${b.insetBottom ?? 88}px` : '0px')
}

function send(kind: string, payload: unknown) {
  const b = bridge()
  if (!b) return
  const message = JSON.stringify({ kind, payload })
  try {
    // Capacitor and a plain WKWebView expose different channels; try the
    // shell's own first so it can choose.
    if (b.postMessage) b.postMessage(message)
    else window.webkit?.messageHandlers?.mushaf?.postMessage(message)
  } catch {
    /* A shell that stops listening must never take the app down with it. */
  }
}

/** Which tab is selected, so the native tab bar can show it. */
export const publishTab = (tab: string) => send('tab', tab)

/** What is playing, for the tab bar's bottom accessory. */
export const publishNowPlaying = (now: NowPlaying | null) => send('nowPlaying', now)

/**
 * Bridge v2 — the native side asking, rather than only being told.
 *
 * v1 pushes two things, which is all a native tab bar needs. CarPlay and a
 * watch need the other direction: list the reciters, list one reciter's
 * surahs, then say "play surah 36 by Barhaji". A template-based interface
 * cannot render a web view, so it cannot reach the app's own screens at all —
 * the data has to come across.
 *
 * The one property that must not be lost is that the web side never awaits the
 * native side. A shell that is missing, older than this, or has stopped
 * listening costs the app nothing; every message it sends is validated, and a
 * handler that throws is contained here rather than becoming an unhandled
 * rejection in the app.
 */

export const BRIDGE_VERSION = 2

export type NativeCommand = {
  verb: 'play' | 'pause' | 'next' | 'prev' | 'seek'
  surah?: number
  reciterId?: string
  seconds?: number
}

export type NativeHandlers = {
  catalog(): Promise<unknown>
  surahs(reciterId: string): Promise<unknown>
  command(c: NativeCommand): void
}

type Incoming = { id?: unknown; kind?: unknown; v?: unknown; payload?: unknown }

const VERBS = ['play', 'pause', 'next', 'prev', 'seek']

const asCommand = (v: unknown): NativeCommand | null => {
  if (typeof v !== 'object' || v === null) return null
  const c = v as Record<string, unknown>
  if (typeof c.verb !== 'string' || !VERBS.includes(c.verb)) return null
  return {
    verb: c.verb as NativeCommand['verb'],
    surah: typeof c.surah === 'number' ? c.surah : undefined,
    reciterId: typeof c.reciterId === 'string' ? c.reciterId : undefined,
    seconds: typeof c.seconds === 'number' ? c.seconds : undefined,
  }
}

/**
 * Listen for requests from the shell.
 *
 * Returns a function that stops listening. In a browser it registers nothing
 * at all and the returned function is a no-op, so the web build pays nothing
 * for a bridge it will never use.
 */
export function answerNative(handlers: NativeHandlers): () => void {
  if (typeof window === 'undefined' || !isNativeShell()) return () => {}

  const onMessage = (event: MessageEvent) => {
    let msg: Incoming
    try {
      msg = typeof event.data === 'string' ? JSON.parse(event.data) : (event.data as Incoming)
    } catch {
      // A shell sending something that is not JSON is a shell we cannot talk
      // to. That is not an error the app should surface, or survive badly.
      return
    }
    if (typeof msg !== 'object' || msg === null) return
    // A shell from a future build speaking a protocol this one does not know.
    // Ignoring it is right: the alternative is guessing at a shape.
    if (msg.v !== BRIDGE_VERSION) return
    const id = typeof msg.id === 'string' ? msg.id : null

    const reply = (result: unknown, error?: string) => {
      if (id) send('reply', { id, result, error })
    }

    try {
      if (msg.kind === 'catalog') {
        handlers
          .catalog()
          .then((r) => reply(r))
          .catch((e: unknown) => reply(null, String(e)))
        return
      }
      if (msg.kind === 'surahs') {
        const reciterId = typeof msg.payload === 'string' ? msg.payload : ''
        handlers
          .surahs(reciterId)
          .then((r) => reply(r))
          .catch((e: unknown) => reply(null, String(e)))
        return
      }
      if (msg.kind === 'command') {
        const c = asCommand(msg.payload)
        if (c) handlers.command(c)
        reply(c ? true : null, c ? undefined : 'unrecognised command')
        return
      }
    } catch (e) {
      // A handler throwing synchronously must not take the listener down with
      // it, or one bad message ends the bridge for the rest of the session.
      reply(null, String(e))
    }
  }

  window.addEventListener('message', onMessage)
  // Tell the shell what it is talking to, so a newer wrapper can decide to
  // stay quiet rather than sending v2 messages at a v1 build.
  send('hello', { v: BRIDGE_VERSION })
  return () => window.removeEventListener('message', onMessage)
}
