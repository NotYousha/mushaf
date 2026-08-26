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
