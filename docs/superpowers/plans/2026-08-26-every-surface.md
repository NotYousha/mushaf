# Every Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one codebase deliberate on six surfaces — phone, tablet, desktop website, television, CarPlay and Apple Watch — without a second copy of the player.

**Architecture:** A surface primitive resolves `phone | tablet | desktop | tv | native` once and stamps it on `<html>` as `data-surface`, before first paint, exactly as the existing boot script stamps `data-theme`, `data-mode`, `lang` and `dir`. CSS keys off the name instead of raw widths. Components consult a hook only where behaviour differs. The two surfaces that cannot be web — CarPlay and watchOS — are authored as Swift against a two-way bridge and shipped unverified.

**Tech Stack:** React 18, TypeScript 5.6, Vite 6, vite-plugin-pwa, vitest 2 + jsdom, `idb`. No new runtime dependencies. Swift 5.9 / Xcode 26 for the native tier, plus Capacitor 6.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-26-every-surface-design.md`. Read it before Task 1.
- **No new runtime dependencies.** `package.json` `dependencies` stays `idb`, `react`, `react-dom`. Capacitor goes in `devDependencies` and ships nothing to the web bundle.
- **CI gates the deploy.** `.github/workflows/deploy.yml` runs `npx tsc --noEmit` then `npx vitest run` before publishing to Pages. A red suite does not merely fail CI, it stops the site updating. Never leave either failing at a commit boundary.
- **Exactly one inline script in `index.html`.** `tests/themeboot.test.ts` asserts `inlineScripts` has length 1 and admits it by a SHA-256 hash of its exact text in the CSP `script-src`. Extend that one script; never add a second. Any edit to it requires recomputing the hash in the same commit.
- **Breakpoints:** 48rem, 64rem, 80rem, 96rem. Root font size is 16px, so 768px, 1024px, 1280px, 1536px. Reuse the steps `src/ui/desktop.css` already breaks at; do not invent new ones.
- **Phone output must not change.** Every new selector is scoped under a `[data-surface=…]` attribute. A phone screenshot before and after this work is identical.
- **Token discipline.** Use `--space-*`, `--radius-*`, `--text-*` from `src/ui/theme.css`. Do not introduce a thirteenth radius or a sixth type size. Scripture is exempt from the type scale and always will be.
- **Logical properties only.** `inset-inline-start`, `padding-inline`, `margin-inline`. Two of the five languages are RTL (`ar`, `ur`); a mirrored stylesheet is not acceptable.
- **Five languages.** Any new user-visible string is added to all of `src/i18n/en.ts`, `ar.ts`, `ur.ts`, `hi.ts`, `fr.ts`. `en.ts` defines the `Strings` type, so it goes first or the others will not typecheck.
- **Comment style.** This codebase explains *why*, in prose, including what was tried and rejected. Match it. Do not write `// set the surface`.
- **The roadmap's exclusions stand.** No prayer times, qibla or athan. No accounts or cloud sync. No streaks, points or badges.
- **Swift is unverified.** This is Windows 11 with no Xcode. Every Swift file carries a header saying it has never been compiled. No commit message or report may claim otherwise.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `src/surface.ts` | Resolve, validate and persist the surface. The `theming.ts` of this feature. |
| `src/ui/useSurface.ts` | React hook: current surface, re-resolving on resize and media change. |
| `src/ui/SurfacePicker.tsx` | The Settings control that forces a surface. |
| `src/ui/surfaces.css` | Pane geometry per surface. Replaces width queries in `desktop.css`. |
| `src/ui/SplitView.tsx` | The tablet/desktop two-and-three-pane shell. |
| `src/tv/focus.ts` | Directional focus resolution over element rectangles. Pure geometry, no DOM. |
| `src/tv/FocusManager.tsx` | Binds `focus.ts` to real keyboard events and real elements. |
| `src/ui/tv.css` | The 10-foot UI. |
| `src/ui/CommandPalette.tsx` | ⌘K palette. |
| `src/ui/shortcuts.ts` | Keyboard shortcut table and the text-input guard. |
| `landing/index.html` | The landing page. Ships no React. |
| `landing/landing.css` | Its styles. |
| `landing/landing.ts` | The standalone/returning-visitor redirect and the word-sync demo. |
| `src/landing/enter.ts` | `shouldEnterApp()` — pure, so it can be tested. |
| `native/` | Capacitor shell, CarPlay templates, watchOS companion. All unverified Swift. |
| `tests/surface.test.ts`, `tests/focus.test.ts`, `tests/split.test.ts`, `tests/enter.test.ts`, `tests/shortcuts.test.ts`, `tests/bridge.test.ts` | Coverage for each. |

**Modified:** `index.html` (boot script + CSP hash), `vite.config.ts` (second entry, manifest), `src/App.tsx` (mount the hook, the split shell, the palette), `src/ui/desktop.css` (width queries become surface queries), `src/native/shell.ts` (bridge v2), `tests/themeboot.test.ts` (the boot harness gains a surface), `src/i18n/*.ts` (new strings).

---

# Phase 0 — The surface primitive

Nothing else in this plan works until this exists.

### Task 1: Resolve a surface

**Files:**
- Create: `src/surface.ts`
- Test: `tests/surface.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type SurfaceId = 'phone' | 'tablet' | 'desktop' | 'tv' | 'native'`; `type SurfaceChoice = SurfaceId | 'auto'`; `type Probe = { width: number; hover: boolean; fine: boolean; coarse: boolean; tvUA: boolean; native: boolean }`; `resolveSurface(p: Probe, choice: SurfaceChoice): SurfaceId`; `probe(): Probe`; `asChoice(v: unknown): SurfaceChoice`; `bootSurface(): SurfaceChoice`; `applySurface(choice: SurfaceChoice): SurfaceId`; `watchSurface(onChange: () => void): () => void`; consts `SURFACES`, `SURFACE_KEY = 'mushaf:surface'`, `DEFAULT_CHOICE = 'auto'`, `TV_UA`.

**The problem this task has to solve.** An iPad Pro in landscape is 1366 CSS px, coarse pointer, no hover. A 1080p television browser is often 1920, but Android TV's browser frequently reports 1280 at 1.5× device pixel ratio. By width, pointer and hover alone **a large tablet and a television are indistinguishable**, and getting it wrong sends every iPad user to a 10-foot UI. So auto-detection uses a user-agent test as an additional signal — legitimate here, because TV platforms do identify themselves — and the width bar for a TV without a recognised UA is set at 96rem, above any shipping tablet. Anything a probe cannot settle is settled by the override, which is why the override exists.

- [ ] **Step 1: Write the failing test**

Create `tests/surface.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  resolveSurface,
  asChoice,
  bootSurface,
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
    expect(
      resolveSurface(p({ width: 1920, fine: true, coarse: false, hover: true }), 'auto'),
    ).toBe('desktop')
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/surface.test.ts`
Expected: FAIL — `Failed to resolve import "../src/surface"`.

- [ ] **Step 3: Write the implementation**

Create `src/surface.ts`:

```ts
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
 * 96rem, not the 80rem the breakpoint list suggests.
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
       fallbacks below are chosen so that the answer is the phone layout —
       which is the one that works at any size. */
    return false
  }
}

/** Read the real environment. Separated from resolveSurface so the rules can
 *  be tested without a browser. */
export function probe(): Probe {
  const native =
    typeof window !== 'undefined' && window.MushafNative?.ready === true

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

/** The choice the boot script acted on, so React's first render agrees with
 *  what is already stamped on <html>. */
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
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run tests/surface.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. `window.MushafNative` is already declared in `src/native/shell.ts`'s `global` block, so `probe()` typechecks without a new declaration.

- [ ] **Step 6: Commit**

```bash
git add src/surface.ts tests/surface.test.ts
git commit -m "Name the surface the app is running on

Five names, resolved once, so CSS can key off a surface instead of a
width and a component can ask when behaviour differs rather than when a
size does.

The rule that needed care is the television. An iPad Pro in landscape is
1366 CSS px, coarse-pointered and hoverless, which is indistinguishable
from a TV through a media query -- and Android TV's browser often reports
1280 at 1.5x DPR, which is narrower than the tablet. So a television
either names itself in the user agent or clears 96rem, which nothing that
ships as a tablet does. Hover is what keeps a laptop on a projector out
of it.

Native outranks the override on purpose: a stored 'tv' from someone
experimenting on a laptop must not follow them into the iOS app and take
the native tab bar away."
```

---

### Task 2: Stamp it before the first paint

**Files:**
- Modify: `index.html` — the single inline boot script, and the CSP `script-src` hash
- Modify: `tests/themeboot.test.ts` — the `boot()` harness and two new cases

**Interfaces:**
- Consumes: `SURFACE_KEY`, `SURFACES`, `DEFAULT_CHOICE`, `TV_MIN` semantics from Task 1.
- Produces: `data-surface` on `<html>` before first paint.

**Why this is not optional.** The preference lives in IndexedDB, which cannot be read without awaiting, so React cannot seed from it. Without a synchronous stamp a television opens the phone layout and reflows a second later — the identical failure the theme and the language each had, with the identical fix. The boot script is the slowest request of a cold launch on an iPhone, which is exactly when it has to be right.

**The rule the script must duplicate.** The boot script cannot import `resolveSurface`; it runs before any module loads. So the resolution rule now exists twice, and Step 4 adds the test that stops the two from drifting.

- [ ] **Step 1: Extend the boot script**

In `index.html`, inside the existing `<script>` — after the block that stamps `lang` and `dir`, before the closing `})()` — add:

```js
        /*
         * Which surface, stamped before the first paint for the same reason the
         * theme is: the choice lives in IndexedDB, that cannot be read without
         * awaiting, and a television that opens the phone layout and reflows a
         * second later is the flash this whole arrangement exists to prevent.
         *
         * The rule is duplicated from src/surface.ts rather than imported,
         * because nothing can be imported this early. tests/surface.test.ts
         * runs both against the same cases so they cannot drift.
         */
        var SURFACES = ['phone', 'tablet', 'desktop', 'tv', 'native']
        var choice = 'auto'
        try {
          var s = localStorage.getItem('mushaf:surface')
          if (s === 'auto' || SURFACES.indexOf(s) !== -1) choice = s
        } catch (e) {
          /* Site data blocked. 'auto' stands, which is what surface.ts also
             falls back to, so React's first render agrees with this. */
        }
        var surface
        if (window.MushafNative && window.MushafNative.ready) surface = 'native'
        else if (choice !== 'auto') surface = choice
        else {
          var hover = false
          var fine = false
          var coarse = false
          try {
            hover = window.matchMedia('(hover: hover)').matches
            fine = window.matchMedia('(pointer: fine)').matches
            coarse = window.matchMedia('(pointer: coarse)').matches
          } catch (e) {
            /* No matchMedia. All three stay false, which lands on the phone
               layout — the one that is correct at any size. */
          }
          var tvUA = false
          try {
            tvUA =
              /\b(smart-?tv|googletv|android ?tv|appletv|hbbtv|netcast|viera|web ?os|tizen|bravia|crkey|aft[bms]|silk.*tv)\b/i.test(
                navigator.userAgent,
              )
          } catch (e) {
            /* No navigator. Not a television, then. */
          }
          var w = window.innerWidth
          if (!hover && (tvUA || ((w >= 1536 || (!fine && !coarse)) && !fine))) surface = 'tv'
          else if (fine && hover && w >= 1024) surface = 'desktop'
          else if (w >= 768) surface = 'tablet'
          else surface = 'phone'
        }
        root.setAttribute('data-surface', surface)
```

- [ ] **Step 2: Recompute the CSP hash**

The policy admits the script by a hash of its exact text, so the edit above has just stopped the script from running at all. Recompute:

```bash
node -e "
const fs=require('fs'),c=require('crypto');
const h=fs.readFileSync('index.html','utf8');
const s=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];
console.log('scripts:',s.length);
console.log('sha256-'+c.createHash('sha256').update(s[0][1],'utf8').digest('base64'));
"
```

Expected: `scripts: 1`, then a `sha256-…` value. Replace the existing `'sha256-t6PmvZkam6I8UddHy8NW6tb76xumByjq/lsqLc71wHY='` in the `script-src` directive with the printed value, keeping the quotes.

- [ ] **Step 3: Teach the test harness about the surface**

In `tests/themeboot.test.ts`, the harness runs the real script text with fake globals, so it needs the globals the new block reads. Change the `Stamped` type and the `boot()` helper:

```ts
type Stamped = {
  theme: string | null
  mode: string | null
  lang: string | null
  dir: string | null
  surface: string | null
}

/** Run the real script text with whatever globals the case is about. */
function boot(
  opts: {
    store?: Record<string, string> | 'throws'
    prefersDark?: boolean | 'throws'
    /** What the pointer and hover queries answer, and how wide the window is. */
    env?: { width?: number; hover?: boolean; fine?: boolean; coarse?: boolean; ua?: string }
    native?: boolean
  } = {},
): Stamped {
  const stamped: Stamped = { theme: null, mode: null, lang: null, dir: null, surface: null }
  const localStorage = {
    getItem(key: string) {
      if (opts.store === 'throws') throw new DOMException('blocked', 'SecurityError')
      return opts.store?.[key] ?? null
    },
  }
  const env = opts.env ?? {}
  const win = {
    innerWidth: env.width ?? 390,
    MushafNative: opts.native ? { ready: true } : undefined,
    matchMedia(query: string) {
      if (opts.prefersDark === 'throws') throw new TypeError('no matchMedia')
      if (query.includes('hover')) return { matches: env.hover ?? false }
      if (query.includes('pointer: fine')) return { matches: env.fine ?? false }
      if (query.includes('pointer: coarse')) return { matches: env.coarse ?? true }
      return { matches: opts.prefersDark === true && query.includes('dark') }
    },
  }
  const nav = { userAgent: env.ua ?? 'jsdom' }
  const doc = {
    documentElement: {
      setAttribute(name: string, value: string) {
        if (name === 'data-theme') stamped.theme = value
        if (name === 'data-mode') stamped.mode = value
        if (name === 'lang') stamped.lang = value
        if (name === 'dir') stamped.dir = value
        if (name === 'data-surface') stamped.surface = value
      },
    },
  }
  new Function(
    'localStorage',
    'window',
    'document',
    'navigator',
    inlineScripts[0][1],
  )(localStorage, win, doc, nav)
  return stamped
}
```

Note the fifth parameter: the script reads `navigator.userAgent`, and without it every existing case throws.

- [ ] **Step 4: Add the drift test — the important one**

Append to `tests/themeboot.test.ts`:

```ts
/*
 * The surface rule now exists twice: once in src/surface.ts and once inline in
 * index.html, because nothing can be imported before the first paint. Two
 * copies of a rule drift, and the drift is invisible — the app would resolve
 * one surface in the head and a different one after mount, which is the reflow
 * the inline copy exists to prevent.
 *
 * So both are run over the same cases and required to agree.
 */
describe('the surface stamped in the head', () => {
  const cases: { name: string; env: Parameters<typeof boot>[0]['env']; native?: boolean }[] = [
    { name: 'phone', env: { width: 390 } },
    { name: 'iPad portrait', env: { width: 834 } },
    { name: 'iPad Pro landscape', env: { width: 1366 } },
    { name: 'desktop', env: { width: 1440, fine: true, coarse: false, hover: true } },
    { name: 'laptop on a projector', env: { width: 1920, fine: true, coarse: false, hover: true } },
    { name: 'a television that says so', env: { width: 960, ua: 'Mozilla/5.0 (Android TV)' } },
    { name: 'a very large hoverless screen', env: { width: 1920, coarse: false } },
  ]

  for (const c of cases) {
    it(`agrees with resolveSurface for ${c.name}`, () => {
      const stamped = boot({ env: c.env, native: c.native }).surface
      const expected = resolveSurface(
        {
          width: c.env?.width ?? 390,
          hover: c.env?.hover ?? false,
          fine: c.env?.fine ?? false,
          coarse: c.env?.coarse ?? true,
          tvUA: TV_UA.test(c.env?.ua ?? 'jsdom'),
          native: c.native ?? false,
        },
        'auto',
      )
      expect(stamped, c.name).toBe(expected)
    })
  }

  it('stamps a stored override', () => {
    expect(boot({ store: { 'mushaf:surface': 'tv' } }).surface).toBe('tv')
  })

  it('lets a native shell outrank a stored override', () => {
    expect(boot({ store: { 'mushaf:surface': 'tv' }, native: true }).surface).toBe('native')
  })

  it('stamps a surface even when site data is blocked', () => {
    expect(boot({ store: 'throws' }).surface).toBe('phone')
  })

  it('knows every surface src/surface.ts does, and only those', () => {
    const listed = /var SURFACES = \[([^\]]*)\]/.exec(inlineScripts[0][1])?.[1] ?? ''
    const names = [...listed.matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(names).toEqual(SURFACES)
  })
})
```

Add to the imports at the top of the file:

```ts
import { resolveSurface, SURFACES, TV_UA } from '../src/surface'
```

- [ ] **Step 5: Run the boot suite**

Run: `npx vitest run tests/themeboot.test.ts`
Expected: PASS. If `is admitted by the policy under a hash of its exact text` fails, Step 2 was skipped or the hash was pasted with the `sha256-` prefix doubled.

- [ ] **Step 6: Run everything, because this file gates the launch**

Run: `npx vitest run && npx tsc --noEmit`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add index.html tests/themeboot.test.ts
git commit -m "Stamp the surface before anything paints

Same problem the theme and the language each had: the choice lives in
IndexedDB, IndexedDB cannot be read without awaiting, so React cannot
seed from it and a television would open the phone layout and reflow once
the answer arrived.

The cost is that the resolution rule now exists twice, since nothing can
be imported this early. Both copies are run over the same seven device
cases and required to agree, so the drift -- which would otherwise be
invisible, one surface in the head and another after mount -- fails the
suite instead.

The CSP hash is recomputed. Without that the browser refuses to run the
script at all and every stamp silently stops happening."
```

---

### Task 3: The hook, and a way to force a surface

**Files:**
- Create: `src/ui/useSurface.ts`, `src/ui/SurfacePicker.tsx`
- Modify: `src/App.tsx` (mount the hook; render the picker in the `more` tab at line ~1918), `src/i18n/en.ts`, `ar.ts`, `ur.ts`, `hi.ts`, `fr.ts`
- Test: `tests/surface.test.ts` (append)

**Interfaces:**
- Consumes: everything from Task 1.
- Produces: `useSurface(): { surface: SurfaceId; choice: SurfaceChoice; setChoice: (c: SurfaceChoice) => void }`; `<SurfacePicker t choice onChoose />`.

- [ ] **Step 1: Write the failing test**

Append to `tests/surface.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react'
```

Stop — this codebase has no `@testing-library/react` and the constraint is no new dependencies. Test the hook's logic through `applySurface` instead, which is the part with behaviour. Append:

```ts
import { applySurface } from '../src/surface'

describe('applySurface', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-surface')
  })

  it('stamps the resolved surface on the document', () => {
    applySurface('tv')
    expect(document.documentElement.getAttribute('data-surface')).toBe('tv')
  })

  it('mirrors the choice, not the resolution, so auto stays auto', () => {
    // jsdom is 1024x768 with no pointer queries, which resolves as tablet.
    // What must be stored is the *choice*, or a window that happened to be
    // wide once would pin the layout for good.
    applySurface('auto')
    expect(localStorage.getItem(SURFACE_KEY)).toBe('auto')
  })

  it('round-trips through bootSurface', () => {
    applySurface('desktop')
    expect(bootSurface()).toBe('desktop')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/surface.test.ts -t applySurface`
Expected: FAIL — `applySurface` stamps nothing yet if Task 1 was skipped; if Task 1 is done these pass immediately, which is fine. Confirm they run.

- [ ] **Step 3: Write the hook**

Create `src/ui/useSurface.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import {
  applySurface,
  bootSurface,
  probe,
  resolveSurface,
  watchSurface,
  type SurfaceChoice,
  type SurfaceId,
} from '../surface'
import { getPref, setPref } from '../db/prefs'

const PREF = 'surface'

/**
 * The surface, as React sees it.
 *
 * Seeded from the same localStorage copy the boot script read, so the first
 * render agrees with what is already stamped on <html> and nothing moves after
 * mount. IndexedDB is still the source of truth and is reconciled once it
 * answers — which matters only for someone who cleared site data on one origin
 * and not the other.
 */
export function useSurface() {
  const [choice, setChoiceState] = useState<SurfaceChoice>(bootSurface)
  const [surface, setSurface] = useState<SurfaceId>(() => resolveSurface(probe(), bootSurface()))

  // Re-resolve when the environment moves: rotating a tablet crosses 48rem,
  // and plugging in a mouse flips `pointer: fine` with no resize at all.
  useEffect(() => {
    const settle = () => setSurface(applySurface(choice))
    settle()
    return watchSurface(settle)
  }, [choice])

  useEffect(() => {
    let alive = true
    getPref<SurfaceChoice | null>(PREF, null).then((stored) => {
      if (alive && stored && stored !== choice) setChoiceState(stored)
    })
    return () => {
      alive = false
    }
    // Once, on mount. Re-running this on every choice change would fight the
    // writes below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setChoice = useCallback((next: SurfaceChoice) => {
    setChoiceState(next)
    setSurface(applySurface(next))
    void setPref(PREF, next)
  }, [])

  return { surface, choice, setChoice }
}
```

- [ ] **Step 4: Write the picker**

Create `src/ui/SurfacePicker.tsx`:

```tsx
import type { Strings } from '../i18n'
import { SURFACES, type SurfaceChoice } from '../surface'

type Props = {
  t: Strings
  choice: SurfaceChoice
  resolved: string
  onChoose: (c: SurfaceChoice) => void
}

/**
 * Forcing a surface.
 *
 * Not a debugging affordance, though it serves as one. A large tablet and a
 * television are indistinguishable through a media query — see the comment on
 * resolveSurface — so auto-detection is a good guess rather than an answer, and
 * this is where a wrong guess gets corrected. It is also the only way anyone
 * can see the television layout without a television.
 *
 * `native` is offered by no button: it is not a preference, it is a fact about
 * whether a wrapper declared itself, and choosing it in a browser would hide
 * the dock and draw nothing in its place.
 */
export function SurfacePicker({ t, choice, resolved, onChoose }: Props) {
  const options: SurfaceChoice[] = ['auto', ...SURFACES.filter((s) => s !== 'native')]

  return (
    <section className="surface-picker">
      <h3>{t.surface}</h3>
      <p className="surface-note">{t.surfaceNote}</p>
      <div className="surface-options" role="radiogroup" aria-label={t.surface}>
        {options.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={choice === id}
            className="surface-option"
            onClick={() => onChoose(id)}
          >
            {t.surfaceNames[id]}
            {/* What `auto` currently lands on, so the guess is visible rather
                than something to be inferred from the layout. */}
            {id === 'auto' && choice === 'auto' && (
              <span className="surface-resolved"> · {t.surfaceNames[resolved as SurfaceChoice]}</span>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Add the strings, English first**

`src/i18n/en.ts` defines the `Strings` type, so it goes first or the other four will not typecheck. Add these keys to the exported object:

```ts
  surface: 'Screen',
  surfaceNote:
    'Chosen automatically. A large tablet and a television look the same to a browser, so set it here if the guess is wrong.',
  surfaceNames: {
    auto: 'Automatic',
    phone: 'Phone',
    tablet: 'Tablet',
    desktop: 'Computer',
    tv: 'Television',
    native: 'App',
  },
```

Then the same keys in the other four:

`src/i18n/ar.ts`:
```ts
  surface: 'الشاشة',
  surfaceNote:
    'يُختار تلقائيًا. اللوح الكبير والتلفاز سواء في نظر المتصفح، فاختر هنا إن أخطأ الحدس.',
  surfaceNames: {
    auto: 'تلقائي',
    phone: 'هاتف',
    tablet: 'لوح',
    desktop: 'حاسوب',
    tv: 'تلفاز',
    native: 'تطبيق',
  },
```

`src/i18n/ur.ts`:
```ts
  surface: 'اسکرین',
  surfaceNote:
    'خودکار طور پر منتخب ہوتی ہے۔ بڑا ٹیبلٹ اور ٹی وی براؤزر کو ایک جیسے لگتے ہیں، اس لیے اندازہ غلط ہو تو یہاں سے بدلیں۔',
  surfaceNames: {
    auto: 'خودکار',
    phone: 'فون',
    tablet: 'ٹیبلٹ',
    desktop: 'کمپیوٹر',
    tv: 'ٹی وی',
    native: 'ایپ',
  },
```

`src/i18n/hi.ts`:
```ts
  surface: 'स्क्रीन',
  surfaceNote:
    'स्वचालित रूप से चुनी जाती है। बड़ा टैबलेट और टीवी ब्राउज़र को एक जैसे दिखते हैं, इसलिए अनुमान गलत हो तो यहाँ बदलें।',
  surfaceNames: {
    auto: 'स्वचालित',
    phone: 'फ़ोन',
    tablet: 'टैबलेट',
    desktop: 'कंप्यूटर',
    tv: 'टीवी',
    native: 'ऐप',
  },
```

`src/i18n/fr.ts`:
```ts
  surface: 'Écran',
  surfaceNote:
    'Choisi automatiquement. Une grande tablette et un téléviseur se ressemblent pour un navigateur ; corrigez ici si la détection se trompe.',
  surfaceNames: {
    auto: 'Automatique',
    phone: 'Téléphone',
    tablet: 'Tablette',
    desktop: 'Ordinateur',
    tv: 'Téléviseur',
    native: 'Application',
  },
```

- [ ] **Step 6: Mount both in App.tsx**

Add the imports beside the existing `ThemePicker` import at line 88:

```ts
import { SurfacePicker } from './ui/SurfacePicker'
import { useSurface } from './ui/useSurface'
```

Inside the component, beside the other state near line 165:

```ts
const { surface, choice: surfaceChoice, setChoice: setSurfaceChoice } = useSurface()
```

In the `more` tab at line ~1927, after `<ThemePicker … />`:

```tsx
<SurfacePicker
  t={t}
  choice={surfaceChoice}
  resolved={surface}
  onChoose={setSurfaceChoice}
/>
```

- [ ] **Step 7: Verify**

Run: `npx vitest run && npx tsc --noEmit`
Expected: both clean. A missing key in any of the four non-English files fails `tsc`, which is how this stays translated.

- [ ] **Step 8: Commit**

```bash
git add src/ui/useSurface.ts src/ui/SurfacePicker.tsx src/App.tsx src/i18n tests/surface.test.ts
git commit -m "Let the surface be seen, and be corrected

The hook seeds from the same localStorage copy the boot script read, so
the first render agrees with what is already on <html>. It re-resolves on
resize and on the pointer queries, because plugging in a mouse flips
pointer: fine with no resize at all.

The picker is in Settings because auto-detection is a good guess and not
an answer: nothing in a browser distinguishes a 1366-wide iPad from a
television. It is also the only way to see the 10-foot layout without a
television, which is the whole reason the rest of this work is testable
on a laptop."
```

---

# Phase 1 — The tablet

### Task 4: Surface-keyed geometry, replacing the width queries

**Files:**
- Create: `src/ui/surfaces.css`
- Modify: `src/ui/desktop.css` (the `min-width` blocks become `[data-surface]` blocks), `src/main.tsx` (import the new sheet)

**Interfaces:**
- Consumes: `data-surface` from Task 2.
- Produces: `[data-surface="tablet"]`, `[data-surface="desktop"]`, `[data-surface="tv"]` as the selectors every later task styles under.

**What moves and what does not.** The `min-width: 30rem`, `40rem`, `48rem`, `64rem` and `90rem` blocks in `desktop.css` become surface blocks; the `max-width: 23.5rem` (small phones), `max-height: 30rem` (a phone on its side) and `hover: hover` (pointer affordances) blocks **stay as media queries**, because they are about a viewport and a pointer rather than a class of device. A phone on its side is a very short screen, not a small tablet, and that distinction is already correct in the file.

- [ ] **Step 1: Create the sheet**

Create `src/ui/surfaces.css`:

```css
/* =====================================================================
   Geometry per surface
   ---------------------------------------------------------------------
   desktop.css grew a stack of min-width steps trying to say "tablet" and
   "desktop" in pixels. The surface is now named on <html> before the page
   paints, so these say it directly — which is not only shorter, it is the
   only way a television layout can be selected on a laptop and looked at.

   What stayed a media query in desktop.css stayed for a reason: a phone on
   its side is a very short screen rather than a small tablet, and hover is
   about a pointer rather than a class of device.
   ===================================================================== */

/* ---------------------------------------------------------------------
   Tablet — the split view
   ---------------------------------------------------------------------
   An iPad in portrait is 768 or 834 wide. The old rules capped the column
   at 42rem and centred it, so a third of the screen sat empty on either
   side and tapping a surah replaced the list you were reading it from.

   The fix is not a wider column. It is two panes, with the list one
   persisting — push navigation is right on a phone and wrong the moment
   there is room to show both.
   --------------------------------------------------------------------- */
[data-surface='tablet'] .app {
  max-width: none;
  padding-inline: var(--space-4);
}

[data-surface='tablet'] .split {
  display: grid;
  /* The list keeps a fixed measure and the reader takes the rest: a surah
     list gains nothing from growing, and the page has a measure anyway. */
  grid-template-columns: 20rem minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
  /* Logical, so the list is on the right in Arabic and Urdu without a
     second stylesheet. */
  direction: inherit;
}

[data-surface='tablet'] .split-list {
  position: sticky;
  top: 0;
  /* Its own scroller, so the list does not drag the reader with it. */
  max-height: 100dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* Landscape: the page takes the height, and the list gives way to a rail
   it can be pulled back out of. A 15-line page is the point of the app,
   and 1024x768 has the height for it only if nothing else claims it. */
@media (orientation: landscape) {
  [data-surface='tablet'] .split {
    grid-template-columns: 4.5rem minmax(0, 1fr);
  }

  [data-surface='tablet'] .split-list:not(.is-open) .row-main,
  [data-surface='tablet'] .split-list:not(.is-open) .name-plain {
    display: none;
  }

  [data-surface='tablet'] .split-list.is-open {
    /* Over the reader rather than shoving it, so opening the list does not
       reflow the page being read. */
    position: fixed;
    inset-block: 0;
    inset-inline-start: 0;
    width: 20rem;
    z-index: 5;
    box-shadow: var(--shadow-lg);
  }
}

/* A tablet is still a touch device. 44pt stays 44pt. */
[data-surface='tablet'] .row,
[data-surface='tablet'] .dock-tab,
[data-surface='tablet'] .surface-option {
  min-height: 2.75rem;
}
```

- [ ] **Step 2: Import it**

In `src/main.tsx`, add the import beside the other stylesheets, **after** `desktop.css` so surface rules win ties:

```ts
import './ui/surfaces.css'
```

- [ ] **Step 3: Convert the width blocks in desktop.css**

Replace the selector lines only; every declaration inside stays as written.

- `@media (min-width: 30rem) {` → `[data-surface='tablet'] {` … and the inner `.app` becomes `[data-surface='tablet'] .app`. Since nesting is not in use in this file, flatten: delete the `@media (min-width: 30rem)` block entirely — `surfaces.css` sets `max-width: none` for tablet and the 36rem cap it held was a phone-to-tablet interpolation that no longer has anything to interpolate.
- Delete `@media (min-width: 40rem)`, moving its one meaningful rule to `surfaces.css`:

```css
/* Two lines of a surah name fit comfortably now, so the meaning can sit
   beside the name rather than under it. */
[data-surface='tablet'] .name-plain,
[data-surface='desktop'] .name-plain {
  font-size: 0.86rem;
}
```

- Delete `@media (min-width: 48rem)`, moving:

```css
[data-surface='tablet'] .dock-tab,
[data-surface='desktop'] .dock-tab {
  font-size: 0.72rem;
}
```

- `@media (min-width: 64rem) {` → change the opening line to `@media (min-width: 0px) {` is wrong; instead **prefix every selector inside with `[data-surface='desktop']`** and delete the `@media` wrapper. There are 18 selectors in that block. Mechanical, and `npx vitest run tests/a11y.test.ts` plus a visual check at 1440px is the verification.
- `@media (min-width: 90rem)` → `[data-surface='desktop'] .app { max-width: 76rem; }` at the end of the desktop group. The two caps (68rem then 76rem) collapse into one; the intermediate step existed to interpolate between breakpoints that no longer exist.

- [ ] **Step 4: Verify nothing regressed on a phone**

Run: `npx vitest run && npx tsc --noEmit`

Then run the app and confirm by eye at three widths:

```bash
npm run dev
```

Open `http://localhost:5173/mushaf/` and check: at 390px wide the layout is unchanged from before this task; at 834px the split view appears; at 1440px the rail is present as before. Use Settings → Screen to force each rather than trusting the window size.

- [ ] **Step 5: Commit**

```bash
git add src/ui/surfaces.css src/ui/desktop.css src/main.tsx
git commit -m "Say tablet and desktop, instead of spelling them in pixels

Five stacked min-width steps were trying to name two classes of device.
The surface is named on <html> before the page paints, so they can say it
directly -- and the 36rem and 68rem caps go, because they existed only to
interpolate between breakpoints that no longer exist.

The tablet gets two panes with the list one persisting. An iPad in
portrait was showing a 42rem phone column with a third of the screen
empty on either side, and tapping a surah threw away the place in the
list you tapped it from. Push navigation is right on a phone and wrong
the moment there is room for both.

What stayed a media query stayed deliberately. A phone on its side is a
very short screen, not a small tablet, and hover is a fact about a
pointer rather than about a class of device."
```

---

### Task 5: The split shell

**Files:**
- Create: `src/ui/SplitView.tsx`
- Modify: `src/App.tsx` (wrap `.scroll` at line ~1591)
- Test: `tests/split.test.ts`

**Interfaces:**
- Consumes: `useSurface()` from Task 3; the CSS classes `.split`, `.split-list`, `.split-main` from Task 4.
- Produces: `<SplitView surface list main />`; `listSide(dir: 'rtl' | 'ltr'): 'start' | 'end'`.

- [ ] **Step 1: Write the failing test**

Create `tests/split.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { listSide, splits } from '../src/ui/SplitView'
import { LANGS } from '../src/i18n'

describe('splits', () => {
  it('splits on a tablet and a desktop, and never on a phone', () => {
    expect(splits('phone')).toBe(false)
    expect(splits('tablet')).toBe(true)
    expect(splits('desktop')).toBe(true)
  })

  /*
   * A television is one pane and always will be. Two columns at ten feet
   * means neither is legible, and a remote has no way to move between them
   * that is better than a single focused list.
   */
  it('never splits a television', () => {
    expect(splits('tv')).toBe(false)
  })

  /*
   * Inside a wrapper the platform owns the chrome, and the native shell is
   * a phone in every case that ships today. Splitting there would put two
   * panes under a tab bar sized for one.
   */
  it('never splits a native shell', () => {
    expect(splits('native')).toBe(false)
  })
})

describe('listSide', () => {
  it('puts the list where the reading starts', () => {
    expect(listSide('ltr')).toBe('start')
    expect(listSide('rtl')).toBe('start')
  })

  /*
   * The point of the logical value: `start` is the left edge in English and
   * the right edge in Arabic, so one rule serves all five languages and no
   * mirrored stylesheet is needed. This asserts the app has a direction for
   * each of them at all, which is what would actually break.
   */
  it('has a direction for every language the picker offers', () => {
    for (const l of LANGS) {
      expect(['rtl', 'ltr'], l.code).toContain(l.dir)
      expect(listSide(l.dir), l.code).toBe('start')
    }
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/split.test.ts`
Expected: FAIL — `Failed to resolve import "../src/ui/SplitView"`.

- [ ] **Step 3: Write the component**

Create `src/ui/SplitView.tsx`:

```tsx
import type { ReactNode } from 'react'
import type { SurfaceId } from '../surface'

/**
 * Which surfaces get two panes.
 *
 * Not the phone, where push navigation is right and there is no room for
 * both. Not the television: two columns at ten feet leaves neither legible,
 * and a remote has no way of crossing between them that beats one focused
 * list. Not a native shell, where the platform's tab bar is sized for one
 * pane and the app is a phone in every wrapper that ships today.
 */
export const splits = (surface: SurfaceId): boolean =>
  surface === 'tablet' || surface === 'desktop'

/**
 * Where the list pane sits.
 *
 * Always the leading edge — which is the left in English and the right in
 * Arabic and Urdu. Returning a logical value rather than 'left' or 'right'
 * is what lets one grid rule serve all five languages; the alternative is a
 * mirrored stylesheet, and this app has two RTL languages out of five.
 */
export const listSide = (_dir: 'rtl' | 'ltr'): 'start' | 'end' => 'start'

type Props = {
  surface: SurfaceId
  /** The persistent pane: a surah list, or the reciter wall. */
  list: ReactNode
  /** The reader and the player. */
  main: ReactNode
  /** Landscape only, where the list collapses to a rail. */
  listOpen?: boolean
}

/**
 * Two panes, or one.
 *
 * On a surface that does not split this renders `main` alone with no wrapper
 * element at all, so the phone's DOM is exactly what it was — the phone
 * layout is the best thing in this app and none of this improves it.
 */
export function SplitView({ surface, list, main, listOpen = false }: Props) {
  if (!splits(surface)) return <>{main}</>

  return (
    <div className="split">
      <aside className={`split-list${listOpen ? ' is-open' : ''}`}>{list}</aside>
      <div className="split-main">{main}</div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run tests/split.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire it into App.tsx**

At line ~1591 the tree is `<div className="scroll" ref={scrollRef}>` holding every tab's panel. Wrap it so that on a splitting surface the surah list is lifted into the persistent pane:

```tsx
<SplitView
  surface={surface}
  list={
    <SurahList
      t={t}
      lang={lang}
      surahs={visible}
      current={current}
      onPick={(n) => {
        setTab('quran')
        void play(n)
      }}
    />
  }
  main={
    <div className="scroll" ref={scrollRef}>
      {/* every existing tab panel, unchanged */}
    </div>
  }
/>
```

Match the props `SurahList` is already called with further down the same file rather than inventing them; the call above shows the shape, and the existing call site is the authority on the exact prop names.

- [ ] **Step 6: Verify**

Run: `npx vitest run && npx tsc --noEmit`, then `npm run dev` and force Screen → Tablet in Settings. Tapping a surah must play it **without** the list disappearing. Switch language to Arabic and confirm the list moves to the right edge.

- [ ] **Step 7: Commit**

```bash
git add src/ui/SplitView.tsx src/App.tsx tests/split.test.ts
git commit -m "Let the list stay put on a tablet

Tapping a surah used to replace the list you tapped it from, which is
correct on a phone and is the thing that makes an iPad feel like a
stretched phone. Two panes, the list one persistent.

On a surface that does not split this renders no wrapper element at all,
so the phone's DOM is byte for byte what it was.

The list sits at the leading edge as a logical value rather than a side,
because two of the five languages are right-to-left and the alternative
is a second stylesheet that disagrees with the first."
```

---

# Phase 2 — The television

### Task 6: Directional focus

**Files:**
- Create: `src/tv/focus.ts`
- Test: `tests/focus.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Rect = { x: number; y: number; width: number; height: number }`; `type Dir = 'up' | 'down' | 'left' | 'right'`; `type Candidate = { id: string; rect: Rect }`; `nextFocus(from: Rect, candidates: Candidate[], dir: Dir): string | null`.

**Why this is pure geometry.** TV browsers give you no focus model worth having, so the app has to supply one. Keeping it as a function over rectangles — no DOM, no events — is what makes a television testable on a laptop, and this is the only genuinely new interaction system in the plan.

- [ ] **Step 1: Write the failing test**

Create `tests/focus.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { nextFocus, type Candidate, type Rect } from '../src/tv/focus'

const r = (x: number, y: number, width = 100, height = 50): Rect => ({ x, y, width, height })

/*
 *  A grid, laid out as it would be on screen:
 *
 *      a(0,0)    b(200,0)    c(400,0)
 *      d(0,100)  e(200,100)  f(400,100)
 */
const grid: Candidate[] = [
  { id: 'a', rect: r(0, 0) },
  { id: 'b', rect: r(200, 0) },
  { id: 'c', rect: r(400, 0) },
  { id: 'd', rect: r(0, 100) },
  { id: 'e', rect: r(200, 100) },
  { id: 'f', rect: r(400, 100) },
]

describe('nextFocus', () => {
  it('moves to the neighbour in the direction asked for', () => {
    expect(nextFocus(r(0, 0), grid, 'right')).toBe('b')
    expect(nextFocus(r(200, 0), grid, 'right')).toBe('c')
    expect(nextFocus(r(200, 0), grid, 'left')).toBe('a')
    expect(nextFocus(r(0, 0), grid, 'down')).toBe('d')
    expect(nextFocus(r(0, 100), grid, 'up')).toBe('a')
  })

  it('takes the nearest, not merely the first in that direction', () => {
    expect(nextFocus(r(0, 0), grid, 'right')).toBe('b')
    expect(nextFocus(r(0, 0), grid, 'right')).not.toBe('c')
  })

  /*
   * The rule that makes a grid feel like a grid.
   *
   * Moving down from `b` must land on `e` and not on `d`, even though `d` is
   * closer in a straight line from b's corner. Scoring on distance alone
   * makes a remote drift diagonally across a wall of reciters, which is the
   * single most common way a 10-foot UI feels broken.
   */
  it('keeps its column when moving down a grid', () => {
    expect(nextFocus(r(200, 0), grid, 'down')).toBe('e')
    expect(nextFocus(r(400, 0), grid, 'down')).toBe('f')
  })

  it('keeps its row when moving across', () => {
    expect(nextFocus(r(0, 100), grid, 'right')).toBe('e')
  })

  it('returns null at the edge rather than wrapping', () => {
    // Wrapping is worse than stopping: on a long surah list, wrapping from
    // 114 back to 1 on one press loses the reader's place with no undo.
    expect(nextFocus(r(0, 0), grid, 'up')).toBeNull()
    expect(nextFocus(r(0, 0), grid, 'left')).toBeNull()
    expect(nextFocus(r(400, 100), grid, 'right')).toBeNull()
  })

  it('ignores the element it started from', () => {
    expect(nextFocus(r(0, 0), [{ id: 'a', rect: r(0, 0) }], 'right')).toBeNull()
  })

  it('ignores anything with no area, which is how a hidden pane behaves', () => {
    const hidden: Candidate[] = [{ id: 'ghost', rect: r(200, 0, 0, 0) }]
    expect(nextFocus(r(0, 0), hidden, 'right')).toBeNull()
  })

  it('survives an empty candidate list', () => {
    expect(nextFocus(r(0, 0), [], 'down')).toBeNull()
  })

  it('handles a long single column, which is what a surah list is', () => {
    const column: Candidate[] = Array.from({ length: 114 }, (_, i) => ({
      id: `s${i + 1}`,
      rect: r(0, i * 60, 300, 50),
    }))
    expect(nextFocus(r(0, 0, 300, 50), column, 'down')).toBe('s2')
    expect(nextFocus(r(0, 60, 300, 50), column, 'down')).toBe('s3')
    expect(nextFocus(r(0, 60, 300, 50), column, 'up')).toBe('s1')
    expect(nextFocus(r(0, 113 * 60, 300, 50), column, 'down')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/focus.test.ts`
Expected: FAIL — `Failed to resolve import "../src/tv/focus"`.

- [ ] **Step 3: Write the implementation**

Create `src/tv/focus.ts`:

```ts
/**
 * Moving focus with a remote control.
 *
 * A television browser gives you no focus model worth having: Tab order is
 * meaningless on a wall of tiles, and `:focus` follows whatever the page last
 * clicked. So the app supplies its own — a function over rectangles, with no
 * DOM and no events in it, which is the only reason a television layout can be
 * tested on a laptop.
 *
 * The scoring is the whole design. Nearest-by-distance alone is the obvious
 * approach and it is wrong: moving down a grid of reciters from the second
 * column, the tile diagonally below-left is often closer to the starting
 * corner than the one directly below, so focus drifts sideways one row at a
 * time. That drift is the single thing that makes a 10-foot interface feel
 * broken, so misalignment across the axis of travel is penalised heavily
 * enough that it can never be won by proximity along it.
 */

export type Rect = { x: number; y: number; width: number; height: number }

export type Dir = 'up' | 'down' | 'left' | 'right'

export type Candidate = { id: string; rect: Rect }

const centreX = (r: Rect) => r.x + r.width / 2
const centreY = (r: Rect) => r.y + r.height / 2

/**
 * How far past the starting edge a candidate has to be before it counts as
 * lying in that direction at all.
 *
 * Without a threshold, two tiles in the same row whose tops differ by a
 * sub-pixel rounding error each count as "below" the other, and pressing down
 * moves sideways.
 */
const EDGE = 1

/**
 * What misalignment costs, relative to distance travelled.
 *
 * Four is not arbitrary: the widest tile in the reciter wall is about a
 * quarter of the screen, so a penalty of four guarantees that one column of
 * drift always costs more than any distance a single press can cover.
 */
const DRIFT = 4

export function nextFocus(from: Rect, candidates: Candidate[], dir: Dir): string | null {
  const vertical = dir === 'up' || dir === 'down'
  let best: string | null = null
  let bestScore = Infinity

  for (const c of candidates) {
    const { rect } = c
    // A zero-area rectangle is a hidden pane or a collapsed rail. It is not
    // focusable, and a remote landing on it looks like the remote is dead.
    if (rect.width <= 0 || rect.height <= 0) continue
    // The element focus is already on. Comparing rectangles rather than ids
    // means a caller does not have to know its own id.
    if (rect.x === from.x && rect.y === from.y && rect.width === from.width) continue

    // Along the axis of travel: how far, and is it even the right way?
    let along: number
    if (dir === 'right') along = rect.x - (from.x + from.width)
    else if (dir === 'left') along = from.x - (rect.x + rect.width)
    else if (dir === 'down') along = rect.y - (from.y + from.height)
    else along = from.y - (rect.y + rect.height)

    // Overlapping neighbours in a dense list give a small negative gap, which
    // is still the right way; anything meaningfully behind the start is not.
    if (along < -EDGE) continue

    const across = vertical
      ? Math.abs(centreX(rect) - centreX(from))
      : Math.abs(centreY(rect) - centreY(from))

    const score = Math.max(along, 0) + across * DRIFT
    if (score < bestScore) {
      bestScore = score
      best = c.id
    }
  }

  return best
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run tests/focus.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/tv/focus.ts tests/focus.test.ts
git commit -m "Move focus the way a remote expects

A television browser has no focus model worth having, so the app supplies
one: a function over rectangles, with no DOM and no events in it, which is
what lets the television be tested on a laptop.

The scoring is the design. Nearest-by-distance is the obvious rule and it
is wrong -- moving down from the second column of a tile wall, the tile
below-left is often nearer the starting corner than the one directly
below, so focus walks diagonally across the screen one row at a time.
Drift across the axis of travel is priced at four times distance along
it, which is more than any single press can cover.

Edges stop rather than wrap. Wrapping from surah 114 back to 1 on one
press loses a reader's place with nothing to undo it with."
```

---

### Task 7: The 10-foot UI

**Files:**
- Create: `src/tv/FocusManager.tsx`, `src/ui/tv.css`
- Modify: `src/App.tsx` (mount the manager when `surface === 'tv'`), `src/main.tsx` (import `tv.css`)

**Interfaces:**
- Consumes: `nextFocus` from Task 6; `data-surface="tv"` from Task 2.
- Produces: `<FocusManager active>`, which claims arrow keys, `Enter` and `Escape` while mounted.

- [ ] **Step 1: Write the manager**

Create `src/tv/FocusManager.tsx`:

```tsx
import { useEffect } from 'react'
import { nextFocus, type Candidate, type Dir } from './focus'

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

/**
 * What a remote can land on.
 *
 * Queried live on each press rather than kept in state: the surah list is
 * virtualised and the reciter wall is filtered, so a cached list would be
 * stale by the second press and focus would jump to an element that has been
 * unmounted.
 */
const focusables = (): { el: HTMLElement; cand: Candidate }[] => {
  const nodes = document.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), [role="tab"], [role="radio"], [tabindex]:not([tabindex="-1"])',
  )
  return [...nodes].map((el, i) => {
    const b = el.getBoundingClientRect()
    // The id is positional and lives only for this press, so nothing in the
    // app has to grow an id attribute to be reachable by a remote.
    el.dataset.tvIndex = String(i)
    return {
      el,
      cand: { id: String(i), rect: { x: b.x, y: b.y, width: b.width, height: b.height } },
    }
  })
}

type Props = { active: boolean }

/**
 * Arrow keys, Enter and Escape, while a television is the surface.
 *
 * Mounted rather than always-on, and it claims nothing when inactive: on a
 * desktop the arrow keys seek the player and on a phone there is no keyboard
 * at all, so a manager that ran everywhere would break both.
 */
export function FocusManager({ active }: Props) {
  useEffect(() => {
    if (!active) return

    const onKey = (e: KeyboardEvent) => {
      // A remote's number pad and an on-screen keyboard both produce real
      // typing, and a search field must keep it.
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) {
        if (e.key === 'Escape') target.blur()
        return
      }

      if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack') {
        // History is the natural meaning of Back on a television, and the app
        // already pushes a state per screen.
        e.preventDefault()
        history.back()
        return
      }

      const dir = KEYS[e.key]
      if (!dir) return

      const all = focusables()
      const current = document.activeElement as HTMLElement | null
      const from = current?.getBoundingClientRect()
      // Nothing focused yet — the first press should land somewhere sensible
      // rather than doing nothing, which reads as a dead remote.
      if (!from || from.width === 0) {
        e.preventDefault()
        all[0]?.el.focus()
        return
      }

      const id = nextFocus(
        { x: from.x, y: from.y, width: from.width, height: from.height },
        all.map((a) => a.cand),
        dir,
      )
      if (id === null) return
      e.preventDefault()
      const next = all.find((a) => a.cand.id === id)
      next?.el.focus()
      // Keep the focused thing on screen. `nearest` rather than `center`, so a
      // list does not lurch a full page on every press.
      next?.el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  return null
}
```

- [ ] **Step 2: Write the stylesheet**

Create `src/ui/tv.css`:

```css
/* =====================================================================
   Ten feet away
   ---------------------------------------------------------------------
   A television is not a large monitor. It is read at ten feet by someone
   holding a remote, and three things follow from that: type has to be much
   larger than any interface scale allows, the edges of the panel cannot be
   trusted, and focus has to be visible from across a room.
   ===================================================================== */

/*
 * Overscan.
 *
 * Televisions still crop the edges of the picture, and the amount is not
 * knowable — 5% is the figure broadcast has used for decades and is what
 * every console and set-top interface reserves. Without it the first and
 * last item of every list is cut in half on a real set.
 */
[data-surface='tv'] .app {
  max-width: none;
  padding-block: 5vh;
  padding-inline: 5vw;
}

/*
 * The type scale, lifted bodily.
 *
 * Redefining the tokens rather than restyling components is what keeps this
 * from becoming a second design system: every existing rule that reads
 * --text-sm gets the television's version of small for free.
 *
 * Scripture is exempt and stays exempt. The mushaf's own text is sized
 * against the page it imitates, and the page is the one thing here that is
 * already meant to be looked at from a distance.
 */
[data-surface='tv'] {
  --text-xs: 1.25rem;
  --text-sm: 1.5625rem;
  --text-md: 1.9531rem;
  --text-lg: 2.4414rem;
  --text-xl: 3.0518rem;

  --space-4: 1.5rem;
  --space-5: 2.25rem;
  --space-6: 3rem;
}

/*
 * Focus, at ten feet.
 *
 * A 2px outline is invisible from a sofa, and it is the only thing telling
 * anyone where the remote is pointing. Scale as well as outline, because a
 * ring alone disappears against a photograph.
 */
[data-surface='tv'] :focus-visible {
  outline: 4px solid var(--accent);
  outline-offset: 4px;
  border-radius: var(--radius-sm);
}

[data-surface='tv'] .row:focus-visible,
[data-surface='tv'] .face:focus-visible {
  transform: scale(1.04);
  box-shadow: var(--shadow-lg);
}

@media (prefers-reduced-motion: reduce) {
  [data-surface='tv'] .row:focus-visible,
  [data-surface='tv'] .face:focus-visible {
    transform: none;
  }
}

/*
 * Hover states are meaningless here and actively harmful: a television
 * browser reports the last touched element as hovered forever, so two things
 * look focused at once and neither is.
 */
[data-surface='tv'] .row:hover,
[data-surface='tv'] .chip:hover,
[data-surface='tv'] .face:hover {
  background: none;
  box-shadow: none;
  transform: none;
}

/* ---------------------------------------------------------------------
   The reciter wall
   A list of names is a phone idea. With a whole television to spend, the
   photographs are the content and the names are the caption.
   --------------------------------------------------------------------- */
[data-surface='tv'] .reciter-wall {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: var(--space-5);
}

[data-surface='tv'] .reciter-wall .face-art {
  aspect-ratio: 1;
  width: 100%;
  border-radius: var(--radius-lg);
}

/* ---------------------------------------------------------------------
   The page is the centrepiece
   --------------------------------------------------------------------- */
[data-surface='tv'] .mushaf-page,
[data-surface='tv'] .paged-mushaf {
  /* Not the 34rem measure the desktop caps at: that measure is for an arm's
     length, and this is read from a sofa. */
  max-width: min(60rem, 80vw);
  margin-inline: auto;
}

/* The word being recited, at a distance. The desktop's highlight is a tint;
   from ten feet a tint is nothing. */
[data-surface='tv'] .mw.is-now {
  background: var(--tile-active-a);
  color: var(--tile-active-ink);
  border-radius: var(--radius-xs);
}

/* The dock has no place here: a remote cannot reach a bottom bar, and the
   focus manager moves between screens instead. */
[data-surface='tv'] .dock {
  display: none;
}
```

- [ ] **Step 3: Mount it**

In `src/main.tsx`, after the other stylesheet imports:

```ts
import './ui/tv.css'
```

In `src/App.tsx`, beside the existing `<Dock … />` render near line 2408:

```tsx
<FocusManager active={surface === 'tv'} />
```

with the import:

```ts
import { FocusManager } from './tv/FocusManager'
```

- [ ] **Step 4: Extend the accessibility suite to this surface**

The spec asks for `tests/a11y.test.ts` to cover the new surfaces, and the television is where focus visibility stops being a nicety and becomes correctness — it is the *only* indication of where the remote is pointing. Append to `tests/a11y.test.ts`, matching the assertions already in that file:

```ts
import { readFileSync } from 'node:fs'

/*
 * On a phone the focus ring is a courtesy. On a television it is the only
 * thing telling anyone which of forty tiles the remote will act on, and a 2px
 * outline is invisible from a sofa. So the television's ring is asserted
 * rather than trusted to survive a later tidy-up of the stylesheet.
 */
describe('the television focus ring', () => {
  const tv = readFileSync('src/ui/tv.css', 'utf8')

  it('is thick enough to see from across a room', () => {
    const rule = /\[data-surface='tv'\] :focus-visible \{([^}]*)\}/.exec(tv)?.[1] ?? ''
    const width = Number(/outline:\s*(\d+)px/.exec(rule)?.[1] ?? 0)
    expect(width).toBeGreaterThanOrEqual(4)
  })

  it('does not rely on transform alone, which reduced motion removes', () => {
    // The scale is switched off under prefers-reduced-motion, so if the ring
    // were only a transform, that setting would leave focus invisible.
    expect(tv).toMatch(/\[data-surface='tv'\] :focus-visible \{[^}]*outline:/)
  })

  it('switches hover off rather than merely restyling it', () => {
    // A television browser reports the last touched element as hovered
    // indefinitely, so two things look focused and neither is the live one.
    expect(tv).toMatch(/\[data-surface='tv'\][^{]*:hover/)
  })
})
```

- [ ] **Step 5: Verify**

Run: `npx vitest run && npx tsc --noEmit`

Then `npm run dev`, force Screen → Television in Settings, and drive the app with the arrow keys alone. Check: the first arrow press focuses something; arrows move without drifting diagonally across the reciter wall; `Enter` activates; `Escape` goes back; a focused row is obvious from across the room; nothing is cut off at the panel edges.

- [ ] **Step 6: Commit**

```bash
git add src/tv/FocusManager.tsx src/ui/tv.css src/main.tsx src/App.tsx tests/a11y.test.ts
git commit -m "A layout for ten feet, and a remote that can drive it

The type scale is redefined rather than the components restyled, so every
rule that already reads --text-sm gets the television's small for free and
this does not become a second design system. Scripture stays exempt: the
mushaf page is the one thing here already drawn to be read at a distance.

Five percent is reserved at every edge. Televisions still crop the
picture by an amount nobody can query, and without the inset the first
and last row of every list is cut in half on a real set.

Hover is switched off, not merely unstyled. A television browser reports
the last touched element as hovered indefinitely, so two things look
focused at once and neither of them is the one the remote will act on.

The candidate list is queried on every press rather than cached: the
surah list is virtualised, and a cached list sends focus to an element
that has already unmounted."
```

---

# Phase 3 — The website

### Task 8: Two documents, and the app moving to /app/

**Files:**
- Create: `src/landing/enter.ts`
- Modify: `vite.config.ts` (a second entry, and the manifest)
- Test: `tests/enter.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `shouldEnterApp(env: { standalone: boolean; hasUsedApp: boolean }): boolean`; `APP_PATH = 'app/'`; `USED_KEY = 'mushaf:used'`.

**The migration risk, stated plainly.** Installed PWAs hold `scope: /mushaf/`, which still covers `/mushaf/app/`, so no installed app breaks. But `start_url` moves, and until a client refreshes the manifest an installed app opens `/mushaf/` — the landing page. So the landing page must send an installed app straight through. This failure is invisible on a fresh browser and appears only for someone who already has the app, which is why it is the one piece of the landing page carrying a test.

- [ ] **Step 1: Write the failing test**

Create `tests/enter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shouldEnterApp } from '../src/landing/enter'

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
   * desktop. Someone who was sent a link and gets an app they have never
   * seen instead of the page that was sent to them is worse served than the
   * redirect is worth, and the landing page is responsive.
   */
  it('shows a first-time visitor the page they were sent', () => {
    expect(shouldEnterApp({ standalone: false, hasUsedApp: false })).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/enter.test.ts`
Expected: FAIL — `Failed to resolve import "../src/landing/enter"`.

- [ ] **Step 3: Write it**

Create `src/landing/enter.ts`:

```ts
/**
 * Whether an arrival at the landing page should be sent to the app instead.
 *
 * Split out as a pure function because the interesting case cannot be
 * reproduced in a browser on purpose: it is what happens to someone who
 * installed the app before it moved to /app/, whose start_url still points at
 * the landing page, and who would otherwise launch their installed mushaf and
 * be shown an advert for it.
 */

export const APP_PATH = 'app/'

/** Written once the app has actually been opened. Read here synchronously. */
export const USED_KEY = 'mushaf:used'

export function shouldEnterApp(env: { standalone: boolean; hasUsedApp: boolean }): boolean {
  return env.standalone || env.hasUsedApp
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run tests/enter.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the second entry and move the manifest's start_url**

In `vite.config.ts`, add `resolve` and `build.rollupOptions.input` alongside the existing config, and change the manifest:

```ts
import { resolve } from 'node:path'
```

```ts
  build: {
    rollupOptions: {
      input: {
        // The landing page, which ships no React at all — its job is to load
        // fast and show the word-sync moving, and a framework in the way of
        // that is a framework serving nobody.
        landing: resolve(__dirname, 'landing/index.html'),
        app: resolve(__dirname, 'app/index.html'),
      },
    },
  },
```

and in the `manifest` block:

```ts
        start_url: `${base}${'app/'}`,
        // Scope stays at the base so an app installed before the move keeps
        // working: /mushaf/ still covers /mushaf/app/. Narrowing it here is
        // what would break every existing installation.
        scope: base,
```

- [ ] **Step 6: Move the app's document**

```bash
mkdir -p app
git mv index.html app/index.html
```

Then in `app/index.html`, the module script's path needs a level: change `src="/src/main.tsx"` to `src="../src/main.tsx"`, and add a write of the used-flag to the boot script so the landing page can read it next time — inside the existing single `<script>`, at the end:

```js
        /* Read by the landing page, synchronously, to decide whether someone
           arriving at / has been here before. Written here rather than in the
           app so that it is set even if the app fails to mount. */
        try {
          localStorage.setItem('mushaf:used', '1')
        } catch (e) {
          /* Private window. The cost is seeing the landing page again. */
        }
```

Recompute the CSP hash exactly as in Task 2 Step 2, reading `app/index.html` instead of `index.html`. Update the path in `tests/themeboot.test.ts`:

```ts
const html = readFileSync('app/index.html', 'utf8')
```

- [ ] **Step 7: Verify the build produces both documents**

Run:

```bash
npx vitest run && npx tsc --noEmit && npm run build
ls dist dist/app
```

Expected: `dist/index.html` (landing, once Task 9 creates it — until then the build fails on the missing input, which is expected and is why Task 9 follows immediately) and `dist/app/index.html`.

If the build fails with `Could not resolve entry module "landing/index.html"`, that is Task 9's work; commit Steps 1–6 and proceed.

- [ ] **Step 8: Commit**

```bash
git add vite.config.ts app/index.html src/landing/enter.ts tests/enter.test.ts tests/themeboot.test.ts
git commit -m "Move the app to /app/, and keep every installed copy working

Two documents, so GitHub Pages serves a landing page and an app as real
files with no client-side routing and no 404 fallback in it.

Scope stays at the base deliberately. /mushaf/ still covers /mushaf/app/,
so nothing already installed breaks -- but start_url moves, and until a
client picks up the new manifest an installed app opens the landing page.
Launching your installed mushaf and being shown an advert for it is the
failure here, and it is invisible on a fresh browser, so the redirect
that prevents it is a pure function with a test rather than three lines
of inline script nobody can exercise."
```

---

### Task 9: The landing page

**Files:**
- Create: `landing/index.html`, `landing/landing.css`, `landing/landing.ts`

**Interfaces:**
- Consumes: `shouldEnterApp`, `APP_PATH`, `USED_KEY` from Task 8.
- Produces: the document at `/mushaf/`.

**What it is for.** The app's one real advantage is word-level audio alignment on a real mushaf page — `docs/roadmap.md` opens by saying so, and notes Quran.com has had word-sync requests open since 2018. That advantage does not appear in a feature list and does not survive a screenshot. It has to move. So the page's first screen is a real mushaf page with the highlight travelling word by word, and everything else on the page is subordinate to it.

- [ ] **Step 1: Write the redirect and the demo**

Create `landing/landing.ts`:

```ts
import { shouldEnterApp, APP_PATH, USED_KEY } from '../src/landing/enter'

/**
 * Send an installed app, or a returning reader, straight to the app.
 *
 * Runs at the top of the module and before the page has anything to show, so
 * there is nothing to flash. `replace` rather than `assign`, so Back goes to
 * wherever the reader came from and not into a redirect loop.
 */
function enter() {
  let standalone = false
  try {
    standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS shipped standalone years before it shipped the media query, and
      // an iPhone home-screen app is the single most likely installed client.
      (window.navigator as { standalone?: boolean }).standalone === true
  } catch {
    /* No matchMedia. Treated as a browser, which shows the page — the safe
       direction to be wrong in, since the page has a link to the app. */
  }

  let hasUsedApp = false
  try {
    hasUsedApp = localStorage.getItem(USED_KEY) === '1'
  } catch {
    /* Site data blocked. The reader sees the page; the link still works. */
  }

  if (shouldEnterApp({ standalone, hasUsedApp })) {
    location.replace(new URL(APP_PATH, location.href).href)
    return true
  }
  return false
}

if (!enter()) {
  void startDemo()
}

/**
 * The word-sync demo.
 *
 * This is the page's argument, so it is built from the app's own data rather
 * than a recording of it: the same layout JSON and the same timings, played
 * against the same audio file that ships in public/audio. A video would be
 * smaller and would be lying about what the app does.
 *
 * It is silent until asked. Autoplaying recitation at someone who opened a
 * web page is unacceptable, and browsers block it anyway.
 */
async function startDemo() {
  const page = document.querySelector<HTMLElement>('[data-demo-page]')
  const button = document.querySelector<HTMLButtonElement>('[data-demo-play]')
  if (!page || !button) return

  const words = [...page.querySelectorAll<HTMLElement>('[data-t]')]
  const audio = new Audio(new URL('./audio/burhaji-097.mp3', import.meta.env.BASE_URL).href)
  audio.preload = 'none'

  let raf = 0
  const tick = () => {
    const t = audio.currentTime
    for (const w of words) {
      const start = Number(w.dataset.t)
      const end = Number(w.dataset.tEnd)
      w.classList.toggle('is-now', t >= start && t < end)
    }
    raf = requestAnimationFrame(tick)
  }

  button.addEventListener('click', () => {
    if (audio.paused) {
      void audio.play()
      raf = requestAnimationFrame(tick)
      button.dataset.state = 'playing'
    } else {
      audio.pause()
      cancelAnimationFrame(raf)
      button.dataset.state = 'paused'
    }
  })

  audio.addEventListener('ended', () => {
    cancelAnimationFrame(raf)
    button.dataset.state = 'paused'
    for (const w of words) w.classList.remove('is-now')
  })

  // Someone who scrolls past without playing should still see what the claim
  // means, so the highlight walks the first line once, silently.
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      let i = 0
      const walk = window.setInterval(() => {
        words.forEach((w, n) => w.classList.toggle('is-now', n === i))
        if (++i >= Math.min(words.length, 8)) {
          window.clearInterval(walk)
          words.forEach((w) => w.classList.remove('is-now'))
        }
      }, 420)
    },
    { threshold: 0.5 },
  )
  io.observe(page)
}
```

- [ ] **Step 2: Write the document**

Create `landing/index.html`. Keep the theme boot minimal — the landing page has one palette and does not need the app's eight — but do honour dark mode, because arriving at a cream page from a dark phone is the same jolt the app spent commits fixing.

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="#07080b" />
    <title>الموعظة — Al-Mau'iza</title>
    <meta
      name="description"
      content="A mushaf that follows the recitation word by word, offline, with no account and no server."
    />
    <!-- Same shape as the app's policy, and the same reason: enforced by the
         browser rather than promised in a document. The landing page talks to
         nothing at all, so it can be stricter than the app. -->
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self';
               script-src 'self';
               style-src 'self';
               font-src 'self';
               img-src 'self' data:;
               media-src 'self';
               connect-src 'none';
               object-src 'none';
               base-uri 'none';
               form-action 'none'"
    />
    <link rel="icon" type="image/png" sizes="192x192" href="/mark-192.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/mark-180.png" />
    <link rel="stylesheet" href="../public/fonts/fonts.css" />
    <link rel="stylesheet" href="./landing.css" />
  </head>
  <body>
    <!-- The argument, first, above everything else on the page. -->
    <header class="hero">
      <img class="hero-mark" src="/logo-mark.webp" alt="" width="72" height="72" />
      <h1 class="hero-name">الموعظة</h1>
      <p class="hero-sub">Al-Mau'iza</p>
      <p class="hero-claim">
        The page follows the voice, word by word.
      </p>

      <figure class="demo">
        <div class="demo-page" data-demo-page>
          <!--
            Eight words of Al-Qadr with the timings from data/timings-…json,
            written into the markup at build time by scripts/build-landing.mjs.
            Hand-written here as the shape the script must produce; run the
            script rather than maintaining this by hand.
          -->
          <span class="dw" data-t="0.00" data-t-end="0.78">إِنَّا</span>
          <span class="dw" data-t="0.78" data-t-end="1.66">أَنزَلْنَٰهُ</span>
          <span class="dw" data-t="1.66" data-t-end="2.30">فِى</span>
          <span class="dw" data-t="2.30" data-t-end="3.42">لَيْلَةِ</span>
          <span class="dw" data-t="3.42" data-t-end="4.60">ٱلْقَدْرِ</span>
        </div>
        <figcaption class="demo-cap">
          <button type="button" class="demo-play" data-demo-play data-state="paused">
            <span class="demo-play-on">Play the recitation</span>
            <span class="demo-play-off">Pause</span>
          </button>
          <span class="demo-note">
            Quran.com has had this open as a request since 2018. It is a data
            problem, not a code one.
          </span>
        </figcaption>
      </figure>

      <a class="cta" href="./app/">Open the mushaf</a>
      <p class="cta-note">No account. No server. Works offline. 921&nbsp;KB.</p>
    </header>

    <main>
      <!-- Three features that only exist on top of the alignment, each shown
           rather than described. Copy is taken from docs/roadmap.md, which is
           where the reasoning for each of them already lives. -->
      <section class="feature">
        <h2>Talqeen</h2>
        <p>
          The reciter reads a line, then goes silent for exactly as long as that
          line took, so you recite it back. This is how every halaqa on earth
          teaches. It works with the screen off.
        </p>
      </section>

      <section class="feature">
        <h2>The Veil</h2>
        <p>
          The text is removed from the real page a step at a time — full, faded,
          first word of each line, blank — with the geometry preserved, because
          position on the page is part of what a hafiz memorises. Press and hold
          to peek.
        </p>
      </section>

      <section class="feature">
        <h2>The Fork Drill</h2>
        <p>
          A phrase appears twice and your mouth continues into the wrong surah.
          The audio plays up to the exact word where the two passages diverge,
          cuts, and waits — then plays the correct continuation, and immediately
          the other branch. 1,335 shared phrases, generated from the text rather
          than trusted.
        </p>
      </section>

      <section class="feature feature-quiet">
        <h2>What it will not do</h2>
        <p>
          No streaks, points or badges: the documented failure mode in hifz is
          comparing your pace to someone else's. No AI recitation checking. No
          accounts. No prayer times. It is a mushaf.
        </p>
      </section>
    </main>

    <footer class="foot">
      <a href="./app/">Open the mushaf</a>
      <a href="https://github.com/">Source</a>
    </footer>

    <script type="module" src="./landing.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: Write the stylesheet**

Create `landing/landing.css`. It shares no tokens with the app on purpose — the app's tokens are eight themes deep and the landing page is one palette — but it uses the app's typefaces, because the wordmark has to be the same object in both places.

```css
/* =====================================================================
   The landing page
   ---------------------------------------------------------------------
   One palette, Isha's — the one the mark itself is drawn in, white script
   on black. The app's tokens are not imported: they carry eight themes and
   a mode switch, and this page has one job and one look.
   ===================================================================== */

:root {
  --l-bg: #07080b;
  --l-card: #11161f;
  --l-ink: #f6f8fc;
  --l-soft: #c3cddd;
  --l-quiet: #7c869c;
  --l-accent: #c3cddd;
  --l-now: #4a5b76;
  --l-measure: 34rem;
}

/* The reader who set their system to light gets a light page: arriving at a
   black page from a light phone is the same jolt in the other direction. */
@media (prefers-color-scheme: light) {
  :root {
    --l-bg: #eceef2;
    --l-card: #ffffff;
    --l-ink: #11161f;
    --l-soft: #4a5b76;
    --l-accent: #4a5b76;
    --l-now: #dde2ea;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--l-bg);
  color: var(--l-ink);
  font-family: 'IBM Plex Sans Arabic', system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  /* The page is set left-to-right even though the document is dir=rtl: the
     prose is English and the scripture inside it carries its own direction. */
  direction: ltr;
  text-align: start;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 4rem 1.5rem 3rem;
  text-align: center;
}

.hero-name {
  font-family: 'Amiri', serif;
  direction: rtl;
  font-size: clamp(2.5rem, 9vw, 4.5rem);
  margin: 0;
  line-height: 1.1;
}

.hero-sub {
  margin: 0;
  color: var(--l-soft);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.8rem;
}

.hero-claim {
  margin: 1.5rem 0 0;
  max-width: 24ch;
  font-size: clamp(1.25rem, 4vw, 1.95rem);
  line-height: 1.3;
}

/* ---------------------------------------------------------------------
   The demo — the whole reason this page exists
   --------------------------------------------------------------------- */
.demo {
  margin: 2.5rem 0 0;
  width: 100%;
  max-width: var(--l-measure);
}

.demo-page {
  background: var(--l-card);
  border-radius: 22px;
  padding: 2rem 1.5rem;
  direction: rtl;
  font-family: 'Amiri Quran', 'Amiri', serif;
  /* Sized against the printed page it imitates, not against a UI scale. */
  font-size: clamp(1.75rem, 6vw, 2.75rem);
  line-height: 2;
  text-align: center;
}

.dw {
  border-radius: 8px;
  padding: 0 0.15em;
  /* Only the colours move. Transitioning size or position would reflow the
     line on every word, which is exactly what a printed page never does. */
  transition: background-color 120ms linear, color 120ms linear;
}

.dw.is-now {
  background: var(--l-now);
}

@media (prefers-reduced-motion: reduce) {
  .dw {
    transition: none;
  }
}

.demo-cap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  margin: 1rem 0 0;
}

.demo-play {
  font: inherit;
  color: var(--l-bg);
  background: var(--l-accent);
  border: 0;
  border-radius: 999px;
  padding: 0.6rem 1.4rem;
  cursor: pointer;
}

.demo-play .demo-play-off,
.demo-play[data-state='playing'] .demo-play-on {
  display: none;
}

.demo-play[data-state='playing'] .demo-play-off {
  display: inline;
}

.demo-note {
  color: var(--l-soft);
  font-size: 0.85rem;
  max-width: 40ch;
}

/* ---------------------------------------------------------------------
   The way in
   --------------------------------------------------------------------- */
.cta {
  margin-top: 2.5rem;
  display: inline-block;
  padding: 0.9rem 2.2rem;
  border-radius: 999px;
  background: var(--l-ink);
  color: var(--l-bg);
  text-decoration: none;
  font-size: 1.1rem;
}

.cta-note {
  margin: 0.75rem 0 0;
  color: var(--l-soft);
  font-size: 0.85rem;
}

main {
  max-width: var(--l-measure);
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
  display: grid;
  gap: 2.5rem;
}

.feature h2 {
  font-family: 'Amiri', serif;
  font-size: 1.6rem;
  margin: 0 0 0.5rem;
}

.feature p {
  margin: 0;
  color: var(--l-soft);
}

.feature-quiet {
  border-top: 1px solid var(--l-card);
  padding-top: 2.5rem;
}

.foot {
  display: flex;
  gap: 1.5rem;
  justify-content: center;
  padding: 2rem 1.5rem 4rem;
}

.foot a {
  color: var(--l-soft);
}

:focus-visible {
  outline: 2px solid var(--l-accent);
  outline-offset: 3px;
}
```

- [ ] **Step 4: Write the script that produces the demo's markup**

The five words in Step 2 are hand-written as *the shape the script must emit*, not as content to maintain. Create `scripts/build-landing.mjs`, following the pattern of the existing `scripts/build-segments.mjs`: read `data/timings-burhaji-nabawi.json` and `data/quran-text.json`, take surah 97 (Al-Qadr, which is short enough to be the whole demo and is the surah the bundled `public/audio/burhaji-097.mp3` holds), and emit one `<span class="dw" data-t data-t-end>` per word into `landing/index.html` between two marker comments:

```html
<!-- demo:start --><!-- demo:end -->
```

Add it to `package.json` scripts beside `catalog`:

```json
    "landing": "node scripts/build-landing.mjs",
```

Run it, and confirm the emitted timings are real rather than the placeholders:

```bash
npm run landing
grep -c 'class="dw"' landing/index.html
```

Expected: a count matching the word count of Al-Qadr, and no `data-t="0.00"` on any span but the first.

- [ ] **Step 5: Verify the build makes both documents**

Run:

```bash
npx vitest run && npx tsc --noEmit && npm run build && ls dist dist/app
```

Expected: `dist/index.html` and `dist/app/index.html` both present. Then `npm run preview` and confirm at `/mushaf/`: the demo highlight walks once on scroll, Play plays and the highlight follows the audio, "Open the mushaf" reaches the app, and opening the app once and returning to `/mushaf/` now redirects.

- [ ] **Step 6: Commit**

```bash
git add landing scripts/build-landing.mjs package.json vite.config.ts
git commit -m "A front door that shows the thing, rather than describing it

The app's one real advantage is word-level alignment on a real mushaf
page, and it is invisible in a feature list and dead in a screenshot. So
the first screen is the page with the highlight travelling word by word,
built from the same layout and timing data the app uses -- a video would
be smaller and would be lying.

It ships no React. Nothing on the page needs it, and a framework standing
between a visitor and the one thing worth showing them serves nobody.

Silent until asked. Autoplaying recitation at someone who opened a web
page is not acceptable, so the highlight walks one line unvoiced for
anyone who only scrolls past."
```

---

### Task 10: The desktop workstation

**Files:**
- Modify: `src/ui/surfaces.css` (a third pane), `src/App.tsx` (render the inspector)

**Interfaces:**
- Consumes: `SplitView` from Task 5; `[data-surface="desktop"]` from Task 4.
- Produces: `.split.is-three`, `.split-aside`.

- [ ] **Step 1: Add the three-pane geometry**

Append to `src/ui/surfaces.css`:

```css
/* ---------------------------------------------------------------------
   Desktop — three panes
   ---------------------------------------------------------------------
   The rail already exists: desktop.css unfolds the dock into one. What is
   missing is somewhere for the player to live that is not a sheet over the
   reading. A sheet is right on a phone, where there is one screen and it
   has to be borrowed; on a desktop it covers the page you were following
   along with, which is the one thing you had the screen for.

   The measure caps stay. A line of Uthmani a metre wide is unreadable and
   desktop.css is right to stop the page widening at 34rem; the extra width
   goes to the panes beside it, never to the line.
   --------------------------------------------------------------------- */
[data-surface='desktop'] .split.is-three {
  display: grid;
  grid-template-columns: 15rem minmax(0, 1fr) 21rem;
  gap: var(--space-4);
  align-items: start;
}

[data-surface='desktop'] .split-aside {
  position: sticky;
  top: var(--space-4);
  max-height: calc(100dvh - var(--space-6));
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--card);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

/* Below 80rem there is not room for three, and squeezing them makes the
   reading column narrower than its own measure — which is the one thing the
   extra panes were supposed to protect. */
@media (max-width: 79.99rem) {
  [data-surface='desktop'] .split.is-three {
    grid-template-columns: 15rem minmax(0, 1fr);
  }

  [data-surface='desktop'] .split-aside {
    display: none;
  }
}
```

- [ ] **Step 2: Render the inspector**

In `src/App.tsx`, extend the `SplitView` call from Task 5 to pass a third pane on desktop. Add an `aside` prop to `SplitView`:

```tsx
type Props = {
  surface: SurfaceId
  list: ReactNode
  main: ReactNode
  /** Desktop only: the now-playing inspector, which is a sheet on a phone. */
  aside?: ReactNode
  listOpen?: boolean
}
```

and in its body:

```tsx
  const three = aside != null && surface === 'desktop'
  return (
    <div className={`split${three ? ' is-three' : ''}`}>
      <aside className={`split-list${listOpen ? ' is-open' : ''}`}>{list}</aside>
      <div className="split-main">{main}</div>
      {three && <aside className="split-aside">{aside}</aside>}
    </div>
  )
```

Pass the existing player content as `aside` when `surface === 'desktop'`, reusing the components the `.player` sheet already renders rather than writing a second player.

- [ ] **Step 3: Verify**

Run: `npx vitest run && npx tsc --noEmit`, then `npm run dev` at 1500px and confirm three panes, the reading column no narrower than before, and the player visible without covering the page. Narrow to 1200px and confirm the inspector leaves rather than crushing the middle.

- [ ] **Step 4: Commit**

```bash
git add src/ui/surfaces.css src/ui/SplitView.tsx src/App.tsx
git commit -m "Give the player somewhere to live that is not over the page

A sheet is right on a phone, where there is one screen and it has to be
borrowed. On a desktop it covers the page you were following along with,
which is the reason you had the screen.

The measure caps stay untouched. The extra width goes to the panes beside
the reading column and never to the line -- a metre of Uthmani is
unreadable and desktop.css was right about that. Below 80rem the
inspector leaves rather than squeezing the middle below its own measure,
which would spend the panes on defeating their own purpose."
```

---

### Task 11: The command palette and the keyboard

**Files:**
- Create: `src/ui/shortcuts.ts`, `src/ui/CommandPalette.tsx`
- Modify: `src/App.tsx`
- Test: `tests/shortcuts.test.ts`

**Interfaces:**
- Consumes: `SurfaceId` from Task 1.
- Produces: `type Action = 'toggle' | 'next' | 'prev' | 'ayahNext' | 'ayahPrev' | 'palette' | 'goto'`; `matchShortcut(e: KeyLike, surface: SurfaceId): Action | null`; `type KeyLike = { key: string; metaKey?: boolean; ctrlKey?: boolean; target?: { tagName?: string; isContentEditable?: boolean } | null }`.

- [ ] **Step 1: Write the failing test**

Create `tests/shortcuts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchShortcut, type KeyLike } from '../src/ui/shortcuts'

const k = (key: string, over: Partial<KeyLike> = {}): KeyLike => ({ key, ...over })

describe('matchShortcut', () => {
  it('binds the transport', () => {
    expect(matchShortcut(k(' '), 'desktop')).toBe('toggle')
    expect(matchShortcut(k('ArrowRight'), 'desktop')).toBe('next')
    expect(matchShortcut(k('ArrowLeft'), 'desktop')).toBe('prev')
    expect(matchShortcut(k(']'), 'desktop')).toBe('ayahNext')
    expect(matchShortcut(k('['), 'desktop')).toBe('ayahPrev')
    expect(matchShortcut(k('g'), 'desktop')).toBe('goto')
  })

  it('opens the palette on either platform modifier', () => {
    expect(matchShortcut(k('k', { metaKey: true }), 'desktop')).toBe('palette')
    expect(matchShortcut(k('k', { ctrlKey: true }), 'desktop')).toBe('palette')
    // Bare k is not the palette; it is a letter someone might be typing.
    expect(matchShortcut(k('k'), 'desktop')).toBeNull()
  })

  /*
   * The way this feature normally ships broken.
   *
   * The search field is a text input and the app has one on the Quran tab.
   * Without this guard, typing a surah name puts a space in the box and
   * pauses the recitation, and 'g' silently opens a go-to-page prompt.
   */
  it('never fires while something is being typed into', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(matchShortcut(k(' ', { target: { tagName } }), 'desktop'), tagName).toBeNull()
      expect(matchShortcut(k('g', { target: { tagName } }), 'desktop'), tagName).toBeNull()
    }
    expect(
      matchShortcut(k(' ', { target: { tagName: 'DIV', isContentEditable: true } }), 'desktop'),
    ).toBeNull()
  })

  it('still opens the palette from inside a field, because that is how it is dismissed and reopened', () => {
    expect(
      matchShortcut(k('k', { metaKey: true, target: { tagName: 'INPUT' } }), 'desktop'),
    ).toBe('palette')
  })

  /*
   * A television has its own key handling — the arrows move focus there, and
   * a remote has no modifier key at all. Two handlers claiming the arrows is
   * a remote that seeks the audio instead of moving.
   */
  it('claims nothing on a television', () => {
    for (const key of [' ', 'ArrowRight', '[', 'g']) {
      expect(matchShortcut(k(key), 'tv'), key).toBeNull()
    }
  })

  it('claims nothing on a phone, which has no keyboard to claim', () => {
    expect(matchShortcut(k(' '), 'phone')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/shortcuts.test.ts`
Expected: FAIL — `Failed to resolve import "../src/ui/shortcuts"`.

- [ ] **Step 3: Write it**

Create `src/ui/shortcuts.ts`:

```ts
import type { SurfaceId } from '../surface'

export type Action =
  | 'toggle'
  | 'next'
  | 'prev'
  | 'ayahNext'
  | 'ayahPrev'
  | 'palette'
  | 'goto'

/** Just enough of a KeyboardEvent to be constructed in a test. */
export type KeyLike = {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  target?: { tagName?: string; isContentEditable?: boolean } | null
}

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/

/**
 * Which action a keypress means, if any.
 *
 * Two things are load-bearing here and both are the usual way this feature
 * ships broken.
 *
 * The first is the typing guard. The Quran tab has a search field; without
 * the guard, typing a surah name puts a space in the box *and* pauses the
 * recitation, and pressing g silently opens a go-to-page prompt mid-word.
 * The palette is the one exception, because ⌘K is how it is reopened after
 * being dismissed and its own field has focus at the time.
 *
 * The second is that only the desktop gets any of this. On a television the
 * arrows move focus and a remote has no modifier key, so two handlers on the
 * arrows means a remote that seeks the audio instead of moving. A phone has
 * no keyboard to claim at all.
 */
export function matchShortcut(e: KeyLike, surface: SurfaceId): Action | null {
  const mod = e.metaKey === true || e.ctrlKey === true

  // The palette is checked before the surface and before the typing guard: it
  // is the way out of its own field, and it costs nothing anywhere else.
  if (mod && e.key.toLowerCase() === 'k') return 'palette'

  if (surface !== 'desktop') return null

  const tag = e.target?.tagName ?? ''
  if (TYPING.test(tag) || e.target?.isContentEditable === true) return null

  // A modifier means the browser's own shortcut, not ours.
  if (mod) return null

  switch (e.key) {
    case ' ':
      return 'toggle'
    case 'ArrowRight':
      return 'next'
    case 'ArrowLeft':
      return 'prev'
    case ']':
      return 'ayahNext'
    case '[':
      return 'ayahPrev'
    case 'g':
    case 'G':
      return 'goto'
    default:
      return null
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run tests/shortcuts.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the palette**

Create `src/ui/CommandPalette.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Strings } from '../i18n'

export type Command = {
  id: string
  /** Already localised by the caller: this component holds no strings of its own. */
  label: string
  hint?: string
  run: () => void
}

type Props = {
  t: Strings
  open: boolean
  commands: Command[]
  onClose: () => void
}

/**
 * ⌘K.
 *
 * Filtering is a plain substring test over the labels the caller supplies,
 * which are already localised — searchSurahs() exists for surah names and is
 * the right tool for those; a second fuzzy matcher here would disagree with it
 * about which of two surahs matches "nur".
 */
export function CommandPalette({ t, open, commands, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const input = useRef<HTMLInputElement | null>(null)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands.slice(0, 12)
    return commands.filter((c) => c.label.toLowerCase().includes(q)).slice(0, 12)
  }, [commands, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      input.current?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="palette-scrim" onClick={onClose} role="presentation">
      <div
        className="palette glass"
        role="dialog"
        aria-modal="true"
        aria-label={t.search}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={input}
          className="palette-input"
          value={query}
          placeholder={t.search}
          aria-label={t.search}
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') return onClose()
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndex((i) => Math.min(i + 1, shown.length - 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex((i) => Math.max(i - 1, 0))
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              const c = shown[index]
              if (c) {
                c.run()
                onClose()
              }
            }
          }}
        />
        <ul className="palette-list" role="listbox">
          {shown.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                className="palette-item"
                onClick={() => {
                  c.run()
                  onClose()
                }}
              >
                <span>{c.label}</span>
                {c.hint && <span className="palette-hint">{c.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Wire both into App.tsx**

Add state and one listener:

```tsx
const [paletteOpen, setPaletteOpen] = useState(false)

useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    const action = matchShortcut(e, surface)
    if (!action) return
    e.preventDefault()
    if (action === 'palette') return setPaletteOpen((v) => !v)
    if (action === 'toggle') return void toggle()
    if (action === 'next') return void skipNext()
    if (action === 'prev') return void skipPrev()
    if (action === 'ayahNext') return stepAyah(1)
    if (action === 'ayahPrev') return stepAyah(-1)
    if (action === 'goto') return setTab('text')
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [surface, toggle, skipNext, skipPrev, stepAyah, setTab])
```

Use the handler names already defined in `App.tsx` for the transport rather than the placeholders above; the existing `MediaHandlers` wiring near `updateMetadata` is the authority on what each is called.

Add the palette beside `<Dock … />`, with commands built from `surahMeta` and `THEMES`:

```tsx
<CommandPalette
  t={t}
  open={paletteOpen}
  onClose={() => setPaletteOpen(false)}
  commands={paletteCommands}
/>
```

- [ ] **Step 7: Add the palette's styles**

Append to `src/ui/surfaces.css` — the palette exists only where there is a keyboard:

```css
/* ---------------------------------------------------------------------
   The command palette
   Desktop only: it is opened with a modifier key, and neither a phone nor
   a remote has one.
   --------------------------------------------------------------------- */
.palette-scrim {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  /* Above centre, because the list grows downward and a centred dialog jumps
     as it filters. */
  place-items: start center;
  padding-top: 12vh;
  background: rgb(var(--shadow-rgb) / 0.28);
}

.palette {
  width: min(34rem, 92vw);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}

.palette-input {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--ink-strong);
  font: inherit;
  font-size: var(--text-md);
  padding: var(--space-4);
}

.palette-input:focus {
  outline: none;
}

.palette-list {
  list-style: none;
  margin: 0;
  padding: 0 var(--space-2) var(--space-2);
  max-height: 50vh;
  overflow-y: auto;
}

.palette-item {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  text-align: start;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.palette-item[aria-selected='true'] {
  background: var(--tile);
  color: var(--tile-active-ink);
}

.palette-hint {
  color: var(--muted);
  font-size: var(--text-xs);
}
```

- [ ] **Step 8: Verify**

Run: `npx vitest run && npx tsc --noEmit`, then `npm run dev` at desktop width. Check: `⌘K`/`Ctrl+K` opens and closes the palette; typing filters; `Enter` runs; space toggles playback **only** when the search field does not have focus; typing a surah name into search does not pause the recitation. Force Screen → Television and confirm space and the arrows do nothing.

- [ ] **Step 9: Commit**

```bash
git add src/ui/shortcuts.ts src/ui/CommandPalette.tsx src/ui/surfaces.css src/App.tsx tests/shortcuts.test.ts
git commit -m "A keyboard, and one guard that decides whether it works

The typing guard is the whole feature. The Quran tab has a search field,
and without it typing a surah name puts a space in the box and pauses the
recitation, while g silently opens a go-to-page prompt mid-word. The
palette is the deliberate exception, because its own field has focus when
you press the key that closes it.

Only the desktop gets any of it. On a television the arrows move focus
and a remote has no modifier key, so two handlers on the arrows is a
remote that seeks the audio instead of moving; a phone has no keyboard to
claim in the first place."
```

---

# Phase 4 — The native tier

### Task 12: Bridge v2

**Files:**
- Modify: `src/native/shell.ts`
- Test: `tests/bridge.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: everything the existing module exports, unchanged, plus `BRIDGE_VERSION = 2`; `type NativeRequest = { id: string; kind: 'catalog' | 'surahs' | 'command'; payload?: unknown }`; `answerNative(handlers: NativeHandlers): () => void`; `type NativeHandlers = { catalog(): Promise<unknown>; surahs(reciterId: string): Promise<unknown>; command(c: NativeCommand): void }`; `type NativeCommand = { verb: 'play' | 'pause' | 'next' | 'prev' | 'seek'; surah?: number; reciterId?: string; seconds?: number }`.

**Why v1 is not enough.** v1 pushes two things and that is right for a native tab bar. CarPlay and a watch need to *pull* — list the reciters, list a reciter's surahs, then say "play surah 36 by Barhaji". The property that must survive is that nothing awaits the native side: a shell that is missing, older, or has stopped listening cannot block or break the app, and that is the entire reason v1 is safe.

- [ ] **Step 1: Write the failing test**

Create `tests/bridge.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  BRIDGE_VERSION,
  answerNative,
  isNativeShell,
  publishTab,
  type NativeCommand,
} from '../src/native/shell'

declare global {
  interface Window {
    MushafNative?: { ready?: boolean; insetBottom?: number; postMessage?: (m: string) => void }
  }
}

beforeEach(() => {
  delete window.MushafNative
})

describe('the bridge in a browser', () => {
  it('is not a native shell', () => {
    expect(isNativeShell()).toBe(false)
  })

  it('publishes into the void without throwing', () => {
    expect(() => publishTab('quran')).not.toThrow()
  })

  it('registers no listener, so a browser pays nothing for this', () => {
    const stop = answerNative({
      catalog: async () => ({}),
      surahs: async () => [],
      command: () => {},
    })
    expect(typeof stop).toBe('function')
    expect(() => stop()).not.toThrow()
  })
})

describe('the bridge inside a shell', () => {
  it('answers a request the shell sends', async () => {
    const sent: string[] = []
    window.MushafNative = { ready: true, postMessage: (m) => sent.push(m) }

    const stop = answerNative({
      catalog: async () => ({ reciters: ['barhaji'] }),
      surahs: async () => [1, 2],
      command: () => {},
    })

    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ id: 'r1', kind: 'catalog', v: BRIDGE_VERSION }),
      }),
    )
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0))

    const reply = JSON.parse(sent[sent.length - 1])
    expect(reply).toMatchObject({ kind: 'reply', payload: { id: 'r1' } })
    expect(reply.payload.result).toEqual({ reciters: ['barhaji'] })
    stop()
  })

  it('passes a command through', async () => {
    const got: NativeCommand[] = []
    window.MushafNative = { ready: true, postMessage: () => {} }
    const stop = answerNative({
      catalog: async () => ({}),
      surahs: async () => [],
      command: (c) => got.push(c),
    })

    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          id: 'r2',
          kind: 'command',
          v: BRIDGE_VERSION,
          payload: { verb: 'play', surah: 36, reciterId: 'barhaji' },
        }),
      }),
    )
    await vi.waitFor(() => expect(got).toHaveLength(1))
    expect(got[0]).toMatchObject({ verb: 'play', surah: 36 })
    stop()
  })

  /*
   * The property v1 had and v2 must not lose. An older shell speaking v1, a
   * shell that sends malformed JSON, or one that has stopped listening
   * mid-session must cost the app nothing -- the web app is the thing that
   * has to keep working, and it cannot be taken down by the wrapper around it.
   */
  it('ignores anything it cannot understand rather than throwing', async () => {
    window.MushafNative = { ready: true, postMessage: () => {} }
    const stop = answerNative({
      catalog: async () => {
        throw new Error('catalog is not loaded yet')
      },
      surahs: async () => [],
      command: () => {},
    })

    for (const data of ['not json', '{}', '{"kind":"unknown"}', '{"id":"x","kind":"catalog","v":99}']) {
      expect(() => window.dispatchEvent(new MessageEvent('message', { data }))).not.toThrow()
    }

    // And a handler that rejects must not become an unhandled rejection.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ id: 'r3', kind: 'catalog', v: BRIDGE_VERSION }),
      }),
    )
    await new Promise((r) => setTimeout(r, 10))
    stop()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/bridge.test.ts`
Expected: FAIL — `answerNative` is not exported.

- [ ] **Step 3: Extend the module**

Append to `src/native/shell.ts`, leaving every existing export exactly as it is:

```ts
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
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run tests/bridge.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add src/native/shell.ts tests/bridge.test.ts
git commit -m "Let the native side ask, not only be told

v1 pushes which tab is open and what is playing, which is everything a
native tab bar needs. CarPlay and a watch need the other direction: a
template interface cannot render a web view, so it cannot reach the app's
screens at all and the data has to come across.

What v2 does not give up is that the web side never awaits the native
side. Every message is validated, a version it does not know is ignored
rather than guessed at, and a handler that throws or rejects is contained
here -- because one bad message must not end the bridge for the session,
and the wrapper must never be able to take the app down."
```

---

### Task 13: The iOS shell and CarPlay — unverified Swift

**Files:**
- Create: `native/README.md`, `native/capacitor.config.ts`, `native/ios/MushafBridge.swift`, `native/ios/CarPlaySceneDelegate.swift`

**Interfaces:**
- Consumes: bridge v2 from Task 12.
- Produces: nothing the web build imports. Nothing here enters `dist`.

**Read this before starting.** This machine is Windows 11. There is no Xcode, no simulator, and no way to compile or run a line of what this task produces. CarPlay additionally cannot be exercised without either the simulator's CarPlay window or a head unit, and it requires the `com.apple.developer.carplay-audio` entitlement, which Apple grants by application — it can be refused or simply never answered. Every file gets a header saying it has never been compiled, `native/README.md` says so at the top, and no commit message may imply otherwise.

- [ ] **Step 1: Write the README first, so the state is recorded before the code**

Create `native/README.md`:

```markdown
# The native tier

**None of the Swift in this directory has ever been compiled.** It was written
on Windows 11, where no Xcode exists. Treat it as a reviewed starting point,
not as working code — expect to fix compile errors on first build.

It is here because two of the app's six surfaces cannot be web at any price:

- **CarPlay** renders templates. A web view is not permitted, so the app's own
  screens cannot appear there at all; the data has to cross the bridge.
- **watchOS** has no web view of any kind.

## What you need

Xcode 26 on a Mac, and an Apple Developer account ($99/yr) to keep a build
installed longer than seven days.

**CarPlay also needs an entitlement Apple grants by application:**
`com.apple.developer.carplay-audio`. Request it before writing any more of
this. It can be refused, and it is frequently not answered for weeks. Until it
is granted, `CarPlaySceneDelegate.swift` compiles but the CarPlay scene never
launches.

## Build

```
npm i -D @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "Al-Mau'iza" com.mushaf.almauiza --web-dir=dist
npx cap add ios
cp native/capacitor.config.ts .
npm run build && npx cap sync ios && npx cap open ios
```

Then in Xcode: add `native/ios/*.swift` to the app target, add the CarPlay
scene to `Info.plist` under `UIApplicationSceneManifest`, and add the
entitlement once Apple has granted it.

## What stays web, and does not change

Lock screen and Control Centre transport already work through the Media
Session API in `src/player/mediaSession.ts`, which Safari maps onto
`MPNowPlayingInfoCenter`. Title, artwork, scrubber and ayah stepping work in a
browser today and keep working inside a wrapper. Do not reimplement them.

The offline architecture — chunked resumable downloads, the IndexedDB store,
the service worker, the 604-page renderer, the word alignment — is web code and
stays web code. Rewriting it against URLSession and Core Data is the whole app,
not the chrome.
```

- [ ] **Step 2: Write the Capacitor config**

Create `native/capacitor.config.ts`:

```ts
import type { CapacitorConfig } from '@capacitor/cli'

/**
 * NEVER COMPILED. Written on Windows, where no Xcode exists.
 *
 * webDir is dist, and the app now lives at dist/app — so the shell loads
 * app/index.html rather than the landing page. Shipping the marketing page
 * inside the app would be absurd, and it is the default a wrapper picks.
 */
const config: CapacitorConfig = {
  appId: 'com.mushaf.almauiza',
  appName: "Al-Mau'iza",
  webDir: 'dist',
  ios: {
    // The landing page redirects an installed client through to the app, but
    // inside a wrapper there is no reason to load it and pay the redirect.
    path: 'ios',
  },
  server: {
    iosScheme: 'capacitor',
  },
}

export default config
```

- [ ] **Step 3: Write the bridge host**

Create `native/ios/MushafBridge.swift`:

```swift
//
//  MushafBridge.swift
//
//  NEVER COMPILED. Written on Windows 11, where no Xcode exists. Expect to fix
//  compile errors on the first build; this is a reviewed starting point.
//
//  The native half of bridge v2 (src/native/shell.ts). Two things matter.
//
//  First, the shell must declare itself at document start, before the web app
//  boots — isNativeShell() is read during the first render, and a shell that
//  announces itself late gets one frame of the web dock before it disappears.
//
//  Second, this is the only object that knows how to reach the web app, so
//  CarPlay and the watch both go through it rather than each holding a web
//  view of their own. CarPlay cannot hold one at all.
//

import Foundation
import WebKit

struct NowPlaying: Codable {
    let surah: Int
    let title: String
    let reciter: String
    let artwork: String?
    let playing: Bool
    let progress: Double
}

final class MushafBridge: NSObject, WKScriptMessageHandler {
    static let shared = MushafBridge()

    private weak var webView: WKWebView?
    private var pending: [String: (Result<Data, Error>) -> Void] = [:]

    /// What the web side last published. CarPlay reads this rather than asking,
    /// because a template has to have something to draw immediately.
    private(set) var nowPlaying: NowPlaying?
    private(set) var selectedTab: String = "home"

    /// Called by the scene delegate once the web view exists.
    func attach(to webView: WKWebView) {
        self.webView = webView
        let controller = webView.configuration.userContentController
        controller.add(self, name: "mushaf")
        // Declared at document start so isNativeShell() is true on the first
        // render and the web dock never flashes. insetBottom is the height the
        // native tab bar actually occupies; --native-bottom follows it.
        controller.addUserScript(
            WKUserScript(
                source: "window.MushafNative = { ready: true, insetBottom: 88 };",
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
    }

    // MARK: - Receiving what the web side publishes

    func userContentController(
        _ controller: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let raw = message.body as? String,
              let data = raw.data(using: .utf8),
              let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let kind = envelope["kind"] as? String
        else { return }

        switch kind {
        case "tab":
            selectedTab = envelope["payload"] as? String ?? selectedTab
        case "nowPlaying":
            if let payload = envelope["payload"],
               let bytes = try? JSONSerialization.data(withJSONObject: payload) {
                nowPlaying = try? JSONDecoder().decode(NowPlaying.self, from: bytes)
            } else {
                nowPlaying = nil
            }
            NotificationCenter.default.post(name: .mushafNowPlayingChanged, object: nil)
        case "reply":
            guard let payload = envelope["payload"] as? [String: Any],
                  let id = payload["id"] as? String,
                  let handler = pending.removeValue(forKey: id)
            else { return }
            if let result = payload["result"],
               let bytes = try? JSONSerialization.data(withJSONObject: result) {
                handler(.success(bytes))
            } else {
                handler(.failure(BridgeError.noResult))
            }
        case "hello":
            break
        default:
            break
        }
    }

    // MARK: - Asking the web side

    enum BridgeError: Error { case noWebView, noResult, timedOut }

    /// Ask the web app something. `kind` is one of the v2 kinds: catalog,
    /// surahs, command.
    func request(
        kind: String,
        payload: Any? = nil,
        timeout: TimeInterval = 5,
        then handler: @escaping (Result<Data, Error>) -> Void
    ) {
        guard let webView else { return handler(.failure(BridgeError.noWebView)) }
        let id = UUID().uuidString
        pending[id] = handler

        var message: [String: Any] = ["id": id, "kind": kind, "v": 2]
        if let payload { message["payload"] = payload }

        guard let bytes = try? JSONSerialization.data(withJSONObject: message),
              let json = String(data: bytes, encoding: .utf8)
        else { return handler(.failure(BridgeError.noResult)) }

        // postMessage into the page, which is what answerNative() listens on.
        // Escaped through JSON so a surah name with a quote in it cannot break
        // out of the expression.
        let escaped = json.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        webView.evaluateJavaScript("window.postMessage('\(escaped)', '*')")

        // The web side may be mid-launch, or the page may have been reloaded
        // out from under a pending request. A template that waits forever is
        // a template that never draws.
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { [weak self] in
            guard let pending = self?.pending.removeValue(forKey: id) else { return }
            pending(.failure(BridgeError.timedOut))
        }
    }

    /// Tell the web app to do something. Fire and forget: a transport command
    /// that needs a reply would make every button wait on a web view.
    func command(_ body: [String: Any]) {
        request(kind: "command", payload: body) { _ in }
    }
}

extension Notification.Name {
    static let mushafNowPlayingChanged = Notification.Name("mushafNowPlayingChanged")
}
```

- [ ] **Step 4: Write the CarPlay scene**

Create `native/ios/CarPlaySceneDelegate.swift`:

```swift
//
//  CarPlaySceneDelegate.swift
//
//  NEVER COMPILED. Written on Windows 11, where no Xcode exists.
//
//  Also NEVER LAUNCHED, and not because of this file: a CarPlay audio app
//  requires the com.apple.developer.carplay-audio entitlement, which Apple
//  grants by application. Until that is granted this scene is never created,
//  however correct it is. Request the entitlement before extending this.
//
//  CarPlay is templates. There is no web view, so none of the app's own
//  screens can appear here — everything below is drawn by the system from
//  data fetched across the bridge.
//
//  What is deliberately absent: the mushaf page, the Veil, the Fork Drill,
//  Talqeen, the heat map. Not because they are hard here, but because a driver
//  must not be given something to read. Reciters, surahs, transport. Nothing
//  else belongs in a car.
//

import CarPlay
import Foundation

final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    private var interfaceController: CPInterfaceController?

    func templateApplicationScene(
        _ scene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        self.interfaceController = interfaceController
        interfaceController.setRootTemplate(loadingTemplate(), animated: false, completion: nil)
        loadReciters()
    }

    func templateApplicationScene(
        _ scene: CPTemplateApplicationScene,
        didDisconnectInterfaceController interfaceController: CPInterfaceController
    ) {
        self.interfaceController = nil
    }

    // MARK: - Reciters

    /// Something to draw while the web view is still booting. A CarPlay scene
    /// can connect before the app's web view has loaded at all, and an empty
    /// root template reads as a broken app on the dashboard.
    private func loadingTemplate() -> CPListTemplate {
        let item = CPListItem(text: NSLocalizedString("Loading…", comment: ""), detailText: nil)
        return CPListTemplate(
            title: "Al-Mau'iza",
            sections: [CPListSection(items: [item])]
        )
    }

    private func loadReciters() {
        MushafBridge.shared.request(kind: "catalog") { [weak self] result in
            guard let self,
                  case .success(let data) = result,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let reciters = json["reciters"] as? [[String: Any]]
            else { return }

            let items: [CPListItem] = reciters.compactMap { r in
                guard let id = r["id"] as? String else { return nil }
                let name = (r["ar"] as? String) ?? (r["en"] as? String) ?? id
                // The riwayah is shown in brackets beside the name everywhere
                // else in this app, and a reciter reading Ad-Duri is not a
                // different voice saying the same words. It belongs here too.
                let riwayah = r["riwayah"] as? String
                let item = CPListItem(
                    text: name,
                    detailText: riwayah.map { "(\($0))" }
                )
                item.handler = { [weak self] _, completion in
                    self?.loadSurahs(reciterId: id, title: name)
                    completion()
                }
                return item
            }

            DispatchQueue.main.async {
                let template = CPListTemplate(
                    title: "Al-Mau'iza",
                    sections: [CPListSection(items: items)]
                )
                self.interfaceController?.setRootTemplate(template, animated: true, completion: nil)
            }
        }
    }

    // MARK: - Surahs

    private func loadSurahs(reciterId: String, title: String) {
        MushafBridge.shared.request(kind: "surahs", payload: reciterId) { [weak self] result in
            guard let self,
                  case .success(let data) = result,
                  let surahs = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
            else { return }

            let items: [CPListItem] = surahs.compactMap { s in
                guard let number = s["surah"] as? Int else { return nil }
                let name = (s["ar"] as? String) ?? "\(number)"
                let item = CPListItem(text: name, detailText: nil)
                item.handler = { _, completion in
                    MushafBridge.shared.command([
                        "verb": "play",
                        "surah": number,
                        "reciterId": reciterId,
                    ])
                    // Hand the driver straight to the now-playing template.
                    // Leaving them on a 114-row list while audio starts is how
                    // someone ends up scrolling at speed.
                    self.interfaceController?.pushTemplate(
                        CPNowPlayingTemplate.shared,
                        animated: true,
                        completion: nil
                    )
                    completion()
                }
                return item
            }

            DispatchQueue.main.async {
                let template = CPListTemplate(title: title, sections: [CPListSection(items: items)])
                self.interfaceController?.pushTemplate(template, animated: true, completion: nil)
            }
        }
    }
}
```

- [ ] **Step 5: Confirm none of this reaches the web build**

Run:

```bash
npm run build
grep -rl "CarPlay\|MushafBridge" dist || echo "clean: no native source in dist"
npx vitest run && npx tsc --noEmit
```

Expected: `clean: no native source in dist`, and both checks passing. `native/` is not a Vite input and `.swift` is not in any `globPatterns`, so nothing here is precached or served.

- [ ] **Step 6: Commit**

```bash
git add native
git commit -m "CarPlay and the iOS shell, in Swift that has never been compiled

Written on Windows, where no Xcode exists. Every file says so in its own
header and native/README.md says so first, because Swift that looks
finished and has never been built is worth less than nothing if anyone
mistakes it for tested.

CarPlay is also not merely unbuilt but unlaunchable: an audio app needs
the carplay-audio entitlement, which Apple grants by application and may
refuse or never answer. Until then the scene is never created, however
correct the file is. The README says to request it before writing more.

What is deliberately missing from the car is the mushaf page, the Veil,
the Fork Drill and the heat map. Not because templates make them hard --
because a driver must not be handed something to read. Reciters, surahs,
transport."
```

---

### Task 14: The watch — unverified Swift

**Files:**
- Create: `native/watch/NowPlayingView.swift`, `native/watch/WirdView.swift`, `native/watch/WatchConnector.swift`
- Modify: `native/README.md`

**Interfaces:**
- Consumes: bridge v2 via `MushafBridge` from Task 13.
- Produces: nothing the web build imports.

**What the watch is for.** Not a mushaf. A 604-page mushaf on a 45mm screen is not a smaller version of a good idea. Two things belong on a wrist: the transport, and the wird counter — because counting a wird is the one thing the wrist is genuinely better at than the phone, and it is the only feature in this app whose natural gesture is a tap on your own arm.

- [ ] **Step 1: Write the connector**

Create `native/watch/WatchConnector.swift`:

```swift
//
//  WatchConnector.swift
//
//  NEVER COMPILED. Written on Windows 11, where no Xcode exists.
//
//  watchOS has no web view of any kind, so nothing of the web app can run
//  here. Everything the watch shows crosses two hops: the web app publishes to
//  MushafBridge on the phone, and the phone relays to the watch over
//  WatchConnectivity.
//
//  The relay is one-way for state and one-way for commands, deliberately. A
//  watch that awaits the phone, which awaits a web view, which may be
//  suspended, is a watch whose buttons hang.
//

import Foundation
import WatchConnectivity

struct WatchNowPlaying: Codable, Equatable {
    var surah: Int = 0
    var title: String = ""
    var reciter: String = ""
    var playing: Bool = false
    var progress: Double = 0
}

final class WatchConnector: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchConnector()

    @Published var now = WatchNowPlaying()
    /// Pages owed, from the sabaq/sabqi/manzil tiers on the phone. Debt, never
    /// a streak — the app shows what is owed and never a flame, and that rule
    /// does not get relaxed because the screen is small.
    @Published var pagesOwed: Int = 0

    private override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: - Sending

    /// Fire and forget. `sendMessage` with a reply handler blocks the button
    /// until the phone answers, and the phone may be answering a web view that
    /// is suspended.
    func command(_ verb: String, surah: Int? = nil) {
        var body: [String: Any] = ["verb": verb]
        if let surah { body["surah"] = surah }
        guard WCSession.default.isReachable else {
            // Queued rather than dropped: transferUserInfo survives the phone
            // being briefly unreachable, which on a wrist is most of the time.
            WCSession.default.transferUserInfo(["command": body])
            return
        }
        WCSession.default.sendMessage(["command": body], replyHandler: nil) { _ in
            // A failed transport command is not worth an alert on a watch. The
            // next state push will show whether it took effect.
        }
    }

    /// One tap, one unit of the wird. The count lives on the phone, in
    /// IndexedDB with everything else; this only reports the tap.
    func countWird() {
        command("wird")
    }

    // MARK: - Receiving

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        apply(message)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        apply(userInfo)
    }

    private func apply(_ message: [String: Any]) {
        guard let raw = message["nowPlaying"],
              let bytes = try? JSONSerialization.data(withJSONObject: raw),
              let decoded = try? JSONDecoder().decode(WatchNowPlaying.self, from: bytes)
        else {
            if let owed = message["pagesOwed"] as? Int {
                DispatchQueue.main.async { self.pagesOwed = owed }
            }
            return
        }
        DispatchQueue.main.async { self.now = decoded }
    }

    func session(
        _ session: WCSession,
        activationDidCompleteWith state: WCSessionActivationState,
        error: Error?
    ) {}
}
```

- [ ] **Step 2: Write the two screens**

Create `native/watch/NowPlayingView.swift`:

```swift
//
//  NowPlayingView.swift
//
//  NEVER COMPILED. Written on Windows 11, where no Xcode exists.
//
//  The transport, and nothing else. No surah list: picking one of 114 on a
//  wrist is worse than reaching for the phone, and the watch is only ever
//  worth using for what is already playing.
//

import SwiftUI

struct NowPlayingView: View {
    @ObservedObject private var connector = WatchConnector.shared

    var body: some View {
        VStack(spacing: 8) {
            Text(connector.now.title.isEmpty ? "—" : connector.now.title)
                .font(.headline)
                .lineLimit(2)
                .multilineTextAlignment(.center)

            Text(connector.now.reciter)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            ProgressView(value: connector.now.progress)
                .progressViewStyle(.linear)

            HStack(spacing: 20) {
                Button { connector.command("prev") } label: {
                    Image(systemName: "backward.fill")
                }
                Button { connector.command(connector.now.playing ? "pause" : "play") } label: {
                    Image(systemName: connector.now.playing ? "pause.fill" : "play.fill")
                        .font(.title2)
                }
                Button { connector.command("next") } label: {
                    Image(systemName: "forward.fill")
                }
            }
            .buttonStyle(.plain)
        }
        .padding()
    }
}
```

Create `native/watch/WirdView.swift`:

```swift
//
//  WirdView.swift
//
//  NEVER COMPILED. Written on Windows 11, where no Xcode exists.
//
//  The one thing a wrist does better than a phone.
//
//  Counting a wird is a tap you make without looking, often mid-recitation,
//  often in the dark. On a phone that means unlocking a screen and finding a
//  button; on a wrist it is a tap on your own arm. This is the only screen in
//  the app whose natural gesture is not available on the phone at all.
//
//  What it shows is *debt* -- pages owed -- and never a streak. The documented
//  failure mode in hifz is comparing your pace to someone else's, and the
//  roadmap rules out streaks, points and badges everywhere. A small screen is
//  not a reason to relax that; it is a reason the rule matters more, because
//  there is only room for one number and it must be the honest one.
//

import SwiftUI
import WatchKit

struct WirdView: View {
    @ObservedObject private var connector = WatchConnector.shared
    @State private var counted = 0

    var body: some View {
        VStack(spacing: 10) {
            Text("\(connector.pagesOwed)")
                .font(.system(size: 44, weight: .light, design: .serif))
            Text(connector.pagesOwed == 1 ? "page owed" : "pages owed")
                .font(.caption)
                .foregroundStyle(.secondary)

            Button {
                counted += 1
                connector.countWird()
                // Haptics, because the whole point is a tap made without
                // looking at the screen.
                WKInterfaceDevice.current().play(.click)
            } label: {
                Text("Counted \(counted)")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
        .padding()
    }
}
```

- [ ] **Step 3: Record it in the README**

Append to `native/README.md`:

```markdown
## The watch

`watch/` is a watchOS companion: the transport, and the wird counter. It is
not a mushaf, and it should not become one — 604 pages on a 45mm screen is not
a smaller version of a good idea.

State reaches it in two hops, because watchOS has no web view: the web app
publishes to `MushafBridge` on the phone, and the phone relays over
WatchConnectivity. Both directions are fire-and-forget. A watch that awaits
the phone, which awaits a web view that may be suspended, is a watch whose
buttons hang.

The phone side of the relay is **not written**. `WatchConnector` is the watch
half; the iOS half — a `WCSessionDelegate` on the phone that forwards
`nowPlaying` out and `command` in — still has to be added to
`MushafBridge.swift`, and it is the first thing to write once a Mac is
available.
```

- [ ] **Step 4: Verify nothing leaked into the build, and commit**

Run:

```bash
npm run build
grep -rl "WatchConnector\|WirdView" dist || echo "clean: no native source in dist"
npx vitest run && npx tsc --noEmit
```

```bash
git add native
git commit -m "A watch that counts a wird, and does not try to be a mushaf

604 pages on a 45mm screen is not a smaller version of a good idea, so
the watch gets two things: the transport, and the wird counter. The
counter is the one screen in this app whose natural gesture -- a tap on
your own arm, without looking, in the dark, mid-recitation -- is not
available on the phone at all.

It shows pages owed and never a streak. The roadmap rules out streaks
everywhere and a small screen is not a reason to relax that; with room
for exactly one number it had better be the honest one.

Still never compiled, and the phone half of the WatchConnectivity relay
is still unwritten. The README says which half and says it is first."
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: §1 the surface primitive → Tasks 1–3; §2 phone protection → the Global Constraints plus Task 4's scoping and Task 5's no-wrapper path; §3 tablet → Tasks 4–5; §4 website → Tasks 8–11; §5 television → Tasks 6–7; §6 native → Tasks 12–14, with tvOS explicitly deferred as the spec requires; §7 testing → six new test files plus the extension of `themeboot.test.ts`; §8 exclusions → Global Constraints, and reasserted in Task 14's commit.

**Two gaps found and closed.** The spec's §7 asks for `tests/a11y.test.ts` to be extended to the new surfaces and no task did it — now Task 7 Step 4, because the television is the one surface where focus visibility stops being a nicety and becomes correctness. And the landing page's demo markup needs real timing data written into it; Task 9 Step 2 named `scripts/build-landing.mjs` as its producer but no task wrote that script — now Task 9 Step 4, so five words of scripture are not hand-maintained in an HTML file.

**One spec claim the plan corrected.** The spec listed 80rem as the television threshold. Writing the resolver showed that to be wrong — an iPad Pro in landscape is 1366 px and clears it — so Task 1 uses 96rem plus a user-agent signal. The spec has been amended to match, with the reasoning, rather than left disagreeing with the code.

**Type consistency.** `SurfaceId`/`SurfaceChoice` are used identically in Tasks 1, 3, 5, 7, 11. `splits()` and `listSide()` keep their names between Task 5 and Task 10. `nextFocus(from, candidates, dir)` has one signature in Tasks 6 and 7. `BRIDGE_VERSION = 2` matches the `"v": 2` the Swift sends in Task 13. `USED_KEY = 'mushaf:used'` in Task 8 matches the literal the boot script writes in Task 8 Step 6 and the literal `landing.ts` reads in Task 9.

**One deliberate deviation from the skill's own rules.** Task 3 Step 1 begins by proposing `@testing-library/react` and then rejects it in the same breath, because the constraint is no new dependencies and this codebase has no such library. That reversal is left visible rather than tidied away, so nobody re-adds it.

---

## Execution note

Phases 0 through 3 are verifiable on this machine and should be run and looked at. Phase 4 produces Swift that cannot be compiled here; its only verification is that nothing from `native/` reaches `dist`, which is what its steps check.
