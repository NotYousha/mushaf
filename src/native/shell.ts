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
