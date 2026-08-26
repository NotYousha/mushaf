# Every surface — phone, tablet, desktop, television, car, wrist

**Date:** 2026-08-26
**Status:** design approved, not yet implemented.

## What this is

The app is excellent on a phone and adequate everywhere else. This makes it
deliberate on six surfaces instead of one:

| Surface | Today | After |
|---|---|---|
| Phone | Excellent. The app was built here. | Untouched, and protected by scoping. |
| Tablet / iPad | A 42rem phone column with empty margins. | A two-pane split view. |
| Desktop website | The phone app widened, with a rail. | A landing page that shows the moat, and a three-pane workstation. |
| Television | Nothing. AirPlay audio artwork only. | A 10-foot UI with remote-driven focus. |
| CarPlay | Lock-screen transport via Media Session. | Native templates, driven by a two-way bridge. |
| Apple Watch | Now-playing remote, via the OS. | A native companion: remote plus wird counter. |

Two of those six cannot be web at all, and that constraint shapes the whole
design. See "The native tier" below.

## The choice that matters

Six surfaces, one codebase, and no second copy of the player. Three ways to
express that were considered.

**More media queries.** `src/ui/desktop.css` is 402 lines already doing this,
and it is where the approach runs out. Television needs directional focus
management, which is JavaScript and not CSS. The landing page is a different
document, not a breakpoint. And an iPad needs a different component tree — a
list that persists while you read — rather than different padding around the
same one.

**Separate builds per surface.** Real isolation, but it means three copies of
the catalog, player and IndexedDB wiring kept in sync by hand, and a tripled
precache in an app whose initial download being 921 KB is a stated feature.

**A surface primitive.** Chosen. One module resolves which surface the app is
running on and stamps it on the document root, exactly as the theme boot script
already stamps `data-theme`, `data-mode`, `lang` and `dir`. CSS keys off
`[data-surface="tv"]` rather than a raw pixel width. Components consult it only
where *behaviour* differs, not where sizes do.

Three things make this the right one here. It reuses a pattern this codebase
already proved. It shrinks `desktop.css` rather than growing it, because named
surfaces replace stacked width queries. And because the surface can be forced,
"what does this look like on a television" becomes something you can select in
Settings and screenshot on a laptop, instead of something you find out about
from a user.

---

## 1. The surface primitive

`src/surface.ts` resolves one of five values:

- `phone` — coarse pointer, viewport under 48rem.
- `tablet` — coarse pointer, 48rem and up.
- `desktop` — fine pointer with hover, 64rem and up.
- `tv` — no hover, 80rem and up, and either a coarse pointer or none at all.
- `native` — a native shell has declared itself; `isNativeShell()` already
  answers this and keeps precedence, because the platform owns the chrome there
  regardless of screen size.

The thresholds reuse the steps `desktop.css` already breaks at, so named
surfaces replace those width queries rather than sitting beside them. Order of
precedence is `native`, then the explicit override, then `tv`, `desktop`,
`tablet`, `phone` — a laptop attached to a projector must not become a
television by width alone, which is why `tv` requires the absence of hover and
not merely the size.

The override is the important part: television and car cannot be tested on the
machine this is built on, so the surface must be forceable from Settings and
must persist.

**It is stamped before first paint.** The preference lives in IndexedDB with
every other setting, which cannot be read without awaiting — the same problem
the theme had, with the same solution: a write-through copy in `localStorage`,
read synchronously in the boot script in `index.html`. Without this, a
television opens the phone layout and reflows once IndexedDB answers.

`tests/themeboot.test.ts` recomputes the CSP hash of that inline script from its
own text, so extending the script without updating the hash fails the suite
rather than quietly breaking production. That test must be updated in the same
commit as the script, and the CSP `script-src` hash in `index.html` with it.

## 2. Phone — protect it, do not touch it

The phone layout is the best thing in the app and none of this improves it. The
only phone work is regression prevention: every selector added below is scoped
under a surface attribute so that nothing leaks downward. A phone screenshot
before and after this work should be identical.

## 3. Tablet — the split view

An iPad in portrait is 768 or 834 points wide. The rail arrives at 64rem and the
column caps at 42rem, so today an iPad shows a phone with a third of the screen
empty on either side.

The fix is not a wider column, it is a **two-pane split**. One pane holds the
surah list or the reciter wall and *persists*; the other holds the reader and
the player. Tapping a surah stops replacing your place in the list, which is the
actual reason the phone's push-navigation feels wrong on a tablet.

- **Portrait:** list pane and reader pane side by side.
- **Landscape:** the mushaf page takes full height, and the list pane collapses
  to a rail it can be pulled back out of. A phone on its side is a very short
  screen and is already handled by the `max-height: 30rem` query; a tablet in
  landscape is a different case and must not inherit that.
- **Direction:** the list pane sits on the right under `dir="rtl"` and on the
  left under `ltr`. This is a logical-property concern, not a mirrored
  stylesheet — `inset-inline-start` throughout.
- Touch targets stay at 44pt. A tablet is still a touch device.

## 4. Website — a landing page, and a workstation

Two different design jobs, and conflating them is why the desktop reads as a
widened phone today.

### The landing page

A second Vite entry, so GitHub Pages serves `index.html` and `app/index.html` as
real documents and no client-side routing or 404 fallback is involved.

**It ships no React.** Its job is to load fast and to *show the moat* rather than
describe it: a real mushaf page with word-level highlighting moving in sync with
recitation. That primitive is the app's one genuine advantage — Quran.com has had
word-sync requests open since 2018 — and it is invisible in a feature list and in
a screenshot. It has to move.

Then the reciters, then Talqeen Mode, the Veil and the Fork Drill, each *shown*
rather than explained, then install.

**The migration point.** Installed PWAs hold `scope: /mushaf/`, which still
covers `/mushaf/app/`, so no installed app breaks. But `start_url` moves, and
until a client picks up the new manifest, an installed app opens `/mushaf/`. So
the landing page must detect `display-mode: standalone` and go straight to the
app, and it must do the same for a returning visitor who has opened the app
before. A phone visitor arriving from a shared link still gets the landing page;
it is responsive, and being sent to an app you have never seen instead of the
page someone sent you is worse than a redirect is worth.

This redirect runs before paint and must not flash. It is the one piece of the
landing page that carries a test.

### The workstation

At desktop width the app becomes three panes: library rail, reader, and a
now-playing inspector. The rail already exists — `desktop.css` unfolds the dock
into one at 64rem — so this is the inspector and the pane geometry, not a
rewrite.

Plus the two things that make a desktop app feel like one:

- **A command palette** on `⌘K` / `Ctrl+K`: jump to a surah, a page, a reciter,
  a juz; switch theme, language or reciter; start Talqeen.
- **Real keyboard shortcuts:** space to play, arrows to seek, `[` and `]` to step
  by ayah, `G` to go to a page. Every one of them needs to not fire while a text
  input has focus, which is the usual way this feature ships broken.

The measure caps stay. A line of Uthmani a metre wide is unreadable, and
`desktop.css` is right to stop the page widening at 34rem.

## 5. Television — a 10-foot UI

Type scaled up hard, an overscan-safe inset, the reciter list becoming a **wall**,
and the mushaf page as the centrepiece with word-sync highlighting legible from a
sofa.

The part that is not CSS is **focus**. TV browsers give you no focus model worth
having, so this needs a directional focus manager: a graph of focusable elements,
arrow keys moving between them by geometry, `Enter` to activate, `Back`/`Escape`
to go up. It is the one genuinely new interaction system in this work, and it is
pure logic over element rectangles, so it is testable without a television.

This covers Android TV and smart-TV browsers today, and it is what an AirPlay
mirror shows. A native tvOS target is deliberately deferred — see below.

## 6. The native tier

`src/native/shell.ts` is one-way by design and publishes two things: which tab is
selected, and what is playing. That is enough for a native tab bar. It is not
enough for CarPlay or a watch, which need to **pull** — browse the catalog, fetch
artwork, issue transport commands.

So: **bridge v2.** Versioned, request/response, and still non-blocking — nothing
awaits the native side, and a shell that is missing, older, or has stopped
listening cannot block or break the app. That property is the whole reason the
current bridge is safe and it is not being given up.

On top of it:

- **A Capacitor iOS shell**, with the `WKUserScript` injection already specified
  in `docs/native-ios.md`, so `isNativeShell()` is true on the first render and
  the web dock never flashes.
- **CarPlay.** `CPTemplateApplicationScene`, `CPListTemplate` for reciters and
  surahs, `CPNowPlayingTemplate` for the player. Web views are forbidden in
  CarPlay; it is templates or nothing. This also needs Apple's
  `com.apple.developer.carplay-audio` entitlement, which is an application to
  Apple and not a checkbox in Xcode — it can be requested, refused, or sit
  unanswered, and the plan must not treat it as a build step.
- **watchOS.** A companion that is a *remote and a wird counter*, not a mushaf.
  There is no web view on watchOS at all, and a 604-page mushaf on a 45mm screen
  is not a smaller version of a good idea. The wird counter is the one thing the
  wrist is genuinely better at than the phone.
- **tvOS — deferred, and stated as deferred.** The web TV mode covers the
  television, and a half-built Swift target that cannot be compiled here is worth
  less than an honest note saying it was not attempted.

**None of the Swift can be compiled or verified from this machine.** It is
Windows 11; there is no Xcode, and CarPlay additionally cannot be tested without
either the simulator or a head unit. The Swift ships as reviewed source with
exact build steps, and every file says at its top that it is unverified. Anything
that claims otherwise in a commit message or a report is a lie about the state of
the work.

## 7. Testing

The web side is fully testable and gets covered in the existing style:

- Surface resolution — every input combination, including the override and
  `native` taking precedence.
- The boot script — extend `tests/themeboot.test.ts`, which recomputes the CSP
  hash, so the script and the policy cannot drift.
- The focus graph — directional traversal over element rectangles, wrapping, and
  dead ends.
- The landing page's standalone redirect.
- Split-view pane sides under all five languages, since two of them are RTL.
- `tests/a11y.test.ts` extended to the new surfaces.

`npx tsc --noEmit` and `npx vitest run` both gate the Pages deploy in
`.github/workflows/deploy.yml`, so neither may be left failing — a red suite does
not merely fail CI here, it stops the site updating.

## 8. Deliberately not building

The roadmap's exclusions stand and this work does not smuggle any of them in:
no prayer times, qibla or athan; no accounts or cloud sync; no streaks, points or
badges. Nor a second copy of the player, a native tvOS target, or an Android
native shell.

## Risks

- **The boot script is load-bearing.** It now stamps a fifth thing before paint,
  under a CSP hash, on the slowest request of a cold launch. The test that
  recomputes the hash is what makes this safe to touch.
- **`src/App.tsx` is 2446 lines** and every surface change lands in it. Pane
  geometry and the focus manager go in their own modules; if App.tsx grows during
  this work, that is a signal the boundary was drawn wrong.
- **The second Vite entry changes the manifest.** `start_url`, `scope` and the
  precache all shift, and the failure is invisible on a fresh browser and only
  appears for someone with the app already installed.
- **The CarPlay entitlement may never arrive**, which would leave that Swift
  permanently unbuildable. It is scoped last for that reason.
