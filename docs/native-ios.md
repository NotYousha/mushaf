# Shipping this as an iOS app, with real Liquid Glass

The web build draws its own glass — a backdrop blur with the saturation pushed
up, a translucent fill, and lit and shadowed inner edges. It is a good
approximation and it works on any phone today with no Mac involved.

It is not Apple's material. `.glassEffect()` in SwiftUI and `UIGlassEffect` in
UIKit are native-only; no web view can reach them, and no CSS reproduces their
refraction or the way they pick up motion. To have the real thing, the bottom
of the screen has to be drawn by the platform.

The app is already built for that. Nothing here is a rewrite.

## What the web side already does

`src/native/shell.ts` is the whole contract.

- `isNativeShell()` is true only when the wrapper has set
  `window.MushafNative = { ready: true }` before the app boots.
- When it is true, `<Dock>` renders **nothing** — the platform owns the bottom
  of the screen — and `applyNativeInsets()` sets `--native-bottom`, which the
  scrolling list already pads itself by, so content clears the native bar.
- `publishTab(id)` and `publishNowPlaying(...)` push the two things a native
  tab bar needs: which tab is selected, and what is playing.

The bridge is one-way and never awaited, so a shell that is missing, older, or
has stopped listening cannot block or break the app.

## The tab bar you actually want is a system control

The behaviour in the reference screenshots — the tabs folding away as you
scroll, the player capsule living in the tab bar — is not something to
rebuild. iOS 26 ships it:

```swift
TabView(selection: $tab) {
    Tab("Quran", systemImage: "book", value: .quran) { WebHost() }
    Tab("Mushaf", systemImage: "text.book.closed", value: .mushaf) { WebHost() }
    Tab("Hifz", systemImage: "heart", value: .hifz) { WebHost() }
    Tab(value: .search, role: .search) { WebHost() }
}
// The tabs collapse on scroll-down, exactly as in the screenshots.
.tabBarMinimizeBehavior(.onScrollDown)
// The capsule that sits in the tab bar and expands into the player.
.tabViewBottomAccessory {
    NowPlayingCapsule(state: bridge.nowPlaying)
}
```

`Tab(role: .search)` is what gives the separate search circle beside the pill.
Both the pill and the accessory get Liquid Glass from the system — there is
nothing to style.

## Wrapping the existing app (Capacitor)

This keeps everything already built: the offline downloads, the service
worker, IndexedDB, the mushaf renderer, the alignment data.

1. `npm i @capacitor/core @capacitor/ios && npx cap init && npx cap add ios`
2. Point `webDir` at `dist` in `capacitor.config.ts`.
3. Declare the shell **before** the web app boots, so `isNativeShell()` is true
   on the first render and the web dock never flashes:

```swift
let script = WKUserScript(
    source: "window.MushafNative = { ready: true, insetBottom: 88 };",
    injectionTime: .atDocumentStart,
    forMainFrameOnly: true
)
webView.configuration.userContentController.addUserScript(script)
webView.configuration.userContentController.add(self, name: "mushaf")
```

4. Receive the state the web side publishes:

```swift
func userContentController(_ c: WKUserContentController,
                           didReceive message: WKScriptMessage) {
    guard let raw = message.body as? String,
          let data = raw.data(using: .utf8),
          let msg = try? JSONDecoder().decode(Bridge.self, from: data)
    else { return }
    switch msg.kind {
    case "tab":        selectedTab = msg.tabValue
    case "nowPlaying": nowPlaying = msg.nowPlaying
    default: break
    }
}
```

5. Set `insetBottom` to the height the tab bar actually occupies, and call
   `applyNativeInsets()` again from the web side if it changes.

## What stays web, and what does not

**Already works, unchanged.** Lock screen and Control Centre transport come
from the Media Session API (`src/player/mediaSession.ts`), which Safari maps
onto `MPNowPlayingInfoCenter`. Title, artwork, scrubber, ayah stepping — all
of it works in the browser today and keeps working inside a wrapper.

**Gets better natively.** The AirPlay picker becomes a real
`AVRoutePickerView` instead of `remote.prompt()`, and the volume slider
becomes `MPVolumeView`, which a web page is not allowed to draw at all.

**Still hand-built either way.** The full now-playing sheet. Apple does not
vend one; Music's is bespoke. Only the material underneath it changes.

## What you need

Xcode 26 on a Mac, and an Apple Developer account to keep it installed. A free
Apple ID sideloads for personal use but the build expires after seven days and
has to be reinstalled. The paid account ($99/yr) removes that.

## If you rewrite in SwiftUI instead

Everything above is a wrapper. A full native rewrite gets Liquid Glass
throughout, but the offline architecture — chunked resumable downloads, the
IndexedDB store, the service worker, the 604-page mushaf renderer, the word
alignment — is all web code, and would have to be rebuilt against
`URLSession`, the file system and Core Data. That is the whole app, not the
chrome.
