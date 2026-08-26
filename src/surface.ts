/**
 * Which surface the app is running on.
 *
 * The phone layout was the whole app for a long time, and the other five
 * surfaces were the phone layout with margins. Fixing that by adding width
 * queries stopped working at the television: a remote needs directional focus
 * management, which is logic and not CSS, and a landing page is a document
 * rather than a breakpoint.
 *
 * So the surface is resolved once, named, and stamped on <html> — the same
 * shape as theming.ts, for the same reason. CSS keys off the name, and a
 * component asks only when behaviour differs rather than when a size does.
 *
 * The override is not a debugging affordance. Television and car cannot be
 * tested on the machine this is built on, and — see resolveSurface — a large
 * tablet and a television are genuinely indistinguishable through a media
 * query. The override is how anything a probe cannot settle gets settled.
 */

export type SurfaceId = 'phone' | 'tablet' | 'desktop' | 'tv' | 'native'

/** What a reader can choose. `auto` means "ask the probe". */
export type SurfaceChoice = SurfaceId | 'auto'

export const SURFACES: SurfaceId[] = ['phone', 'tablet', 'desktop', 'tv', 'native']

export const DEFAULT_CHOICE: SurfaceChoice = 'auto'

/**
 * Mirrored into localStorage so the boot script can read it before the page
 * paints. IndexedDB is the source of truth; this is only a copy — the same
 * arrangement THEME_KEY and LANG_KEY have.
 */
export const SURFACE_KEY = 'mushaf:surface'

/** 16px root, so these are the rem steps desktop.css already breaks at. */
const TABLET_MIN = 768 //  48rem
const DESKTOP_MIN = 1024 // 64rem
/**
 * 96rem, not the 80rem the breakpoint list first suggested.
 *
 * An iPad Pro in landscape is 1366 and clears 80rem comfortably, so that bar
 * would have sent every one of them to the 10-foot UI. Nothing that ships as a
 * tablet reaches 1536.
 */
const TV_MIN = 1536 // 96rem

/**
 * Television platforms that identify themselves.
 *
 * Sniffing the user agent is usually the wrong answer and it is the right one
 * here: Android TV's browser commonly reports 1280 CSS px at 1.5x device pixel
 * ratio, which is *below* a large tablet, so no width test can find it. These
 * platforms all announce themselves and none of them is also a tablet.
 */
export const TV_UA =
  /\b(smart-?tv|googletv|android ?tv|appletv|hbbtv|netcast|viera|web ?os|tizen|bravia|crkey|aft[bms]|silk.*tv)\b/i

export type Probe = {
  /** Viewport width in CSS pixels. */
  width: number
  /** `(hover: hover)` — a trackpad has it, a remote does not. */
  hover: boolean
  /** `(pointer: fine)` */
  fine: boolean
  /** `(pointer: coarse)` */
  coarse: boolean
  /** The user agent names a television platform. */
  tvUA: boolean
  /** A native shell has declared itself. */
  native: boolean
}

/**
 * Order of precedence: native, the override, then television, desktop, tablet,
 * phone.
 *
 * Native comes first and cannot be overridden. Inside a wrapper the platform
 * owns the bottom of the screen and <Dock> renders nothing; a stored 'tv' from
 * someone experimenting on a laptop must not follow them into the iOS app and
 * take the native tab bar away with nothing drawn in its place.
 *
 * Television is tested before desktop and requires the *absence* of hover. A
 * laptop attached to a projector is 1920 wide and is not a television, and
 * hover is the one signal that separates a trackpad from a remote control.
 */
export function resolveSurface(p: Probe, choice: SurfaceChoice = 'auto'): SurfaceId {
  if (p.native) return 'native'
  if (choice !== 'auto') return choice

  const noPointer = !p.fine && !p.coarse
  if (!p.hover && (p.tvUA || ((p.width >= TV_MIN || noPointer) && !p.fine))) return 'tv'
  if (p.fine && p.hover && p.width >= DESKTOP_MIN) return 'desktop'
  if (p.width >= TABLET_MIN) return 'tablet'
  return 'phone'
}

const asks = (query: string): boolean => {
  try {
    return window.matchMedia(query).matches
  } catch {
    /* No matchMedia. Every caller treats false as "cannot tell", and the
       fallbacks are chosen so that the answer is the phone layout — which is
       the one that works at any size. */
    return false
  }
}

/**
 * Read the real environment.
 *
 * Separated from resolveSurface so the rules can be tested without a browser,
 * which is the only reason a television layout is verifiable on a laptop.
 */
export function probe(): Probe {
  const native = typeof window !== 'undefined' && window.MushafNative?.ready === true

  if (typeof window === 'undefined') {
    return { width: 0, hover: false, fine: false, coarse: false, tvUA: false, native }
  }

  let tvUA = false
  try {
    tvUA = TV_UA.test(navigator.userAgent)
  } catch {
    /* No navigator, or a hardened one. Not a television, then. */
  }

  return {
    width: window.innerWidth,
    hover: asks('(hover: hover)'),
    fine: asks('(pointer: fine)'),
    coarse: asks('(pointer: coarse)'),
    tvUA,
    native,
  }
}

const isChoice = (v: unknown): v is SurfaceChoice =>
  v === 'auto' || (typeof v === 'string' && (SURFACES as string[]).includes(v))

/**
 * A value this build no longer knows is still sitting in the storage of whoever
 * chose it, and `data-surface="watch"` matches no block in any stylesheet: the
 * app would come up with no pane geometry at all. Every stored value passes
 * through here on its way back in.
 */
export const asChoice = (v: unknown, fallback: SurfaceChoice = DEFAULT_CHOICE): SurfaceChoice =>
  isChoice(v) ? v : fallback

/**
 * The choice the boot script acted on, so React's first render agrees with what
 * is already stamped on <html>.
 */
export function bootSurface(): SurfaceChoice {
  try {
    return asChoice(localStorage.getItem(SURFACE_KEY))
  } catch {
    // Site data blocked. The boot script fell back to the same default, so the
    // two still agree and nothing moves after mount.
    return DEFAULT_CHOICE
  }
}

/** Stamp the resolved surface, and mirror the choice for the next launch. */
export function applySurface(choice: SurfaceChoice): SurfaceId {
  const resolved = resolveSurface(probe(), choice)
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-surface', resolved)
  }
  try {
    localStorage.setItem(SURFACE_KEY, choice)
  } catch {
    /* Private window. The cost is one reflow on the next launch. */
  }
  return resolved
}

/**
 * Re-resolve when the environment moves.
 *
 * Rotating a tablet crosses 48rem, dragging a desktop window narrow crosses
 * 64rem, and plugging in a mouse flips `pointer: fine` with no resize at all —
 * so the pointer queries are watched as well as the size.
 */
export function watchSurface(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const queries = ['(hover: hover)', '(pointer: fine)', '(pointer: coarse)']
  const lists = queries.map((q) => {
    try {
      return window.matchMedia(q)
    } catch {
      return null
    }
  })
  window.addEventListener('resize', onChange)
  for (const l of lists) l?.addEventListener('change', onChange)
  return () => {
    window.removeEventListener('resize', onChange)
    for (const l of lists) l?.removeEventListener('change', onChange)
  }
}
