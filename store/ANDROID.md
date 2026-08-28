# Building the Android app

The app ships to Play as a **Trusted Web Activity** — a thin Android wrapper
around the deployed site. The AAB is a couple of megabytes; the app itself is
the site, so a fix deployed to Pages reaches everyone without a Play release.
That is the main reason to prefer it here over a rewrite.

**This has now been done.** What follows is the record of how, because two
steps of it do not work the way Bubblewrap's own documentation says they do on
Windows, and the next person to run it — including you, on a new laptop, after
losing this one — should not have to rediscover that.

The artefacts are outside this repository, in `../mushaf-android/`:

| | |
| --- | --- |
| `app/build/outputs/bundle/release/app-release.aab` | upload this to Play |
| `app/build/outputs/apk/release/app-release.apk` | install this on your own phone to test |
| `android.keystore` | **the app's identity. Back it up.** |
| `keystore.properties` | its password. Not in any repo; `.gitignore`d. |

**The signing key is the app's identity.** Whoever holds the upload keystore
can publish updates, and losing it means asking Google to reset it. It is a
4096-bit RSA key valid to 2056, generated on 2026-08-28, with the SHA-256
fingerprint recorded in `LISTING.md`. Back up both the keystore and its
password somewhere that is not this machine — that is the one step nobody else
can do for you.

---

## 1. Confirm what the wrapper will read

The manifest at <https://notyousha.github.io/mushaf/manifest.webmanifest> is
what Bubblewrap reads to generate the project. It should already say:

```
"lang": "ar", "dir": "rtl", "id": "/mushaf/", "orientation": "portrait",
"display": "standalone", "start_url": "/mushaf/", "scope": "/mushaf/"
```

If a field is missing, fix it in `vite.config.ts` and deploy first — Bubblewrap
bakes these into the Android project and re-reading them later means
regenerating it.

## 2. The toolchain, and the two places it does not work as documented

Bubblewrap keeps its JDK and Android SDK under `~/.bubblewrap`, and its
`config.json` names both. **Trap one: it does not want an Android SDK laid out
the way Google ships one.** `AndroidSdkTools.validatePath` looks for
`<sdkRoot>/bin` or `<sdkRoot>/tools`, and `checkBuildTools` looks for
`<sdkRoot>/build-tools/<version>` — so it wants the command-line tools' own
`bin/` and `lib/` sitting *at the SDK root*, beside `build-tools/`, not tucked
under `cmdline-tools/latest/` where `sdkmanager` puts them. Get that wrong and
the only thing it says is `The provided androidSdk isn't correct.`

What worked:

```
# 1. command-line tools
curl -L -o cmdline-tools.zip   https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip
unzip cmdline-tools.zip -d ~/.bubblewrap/android_sdk
cd ~/.bubblewrap/android_sdk
mkdir -p cmdline-tools/latest && mv cmdline-tools/{bin,lib,NOTICE.txt,source.properties} cmdline-tools/latest/

# 2. packages. 36.1.0 is the version Bubblewrap's BUILD_TOOLS_VERSION names;
#    android-36 matches the compileSdk it writes into build.gradle.
yes | cmdline-tools/latest/bin/sdkmanager.bat --sdk_root=. --licenses
cmdline-tools/latest/bin/sdkmanager.bat --sdk_root=.   platform-tools "platforms;android-36" "build-tools;36.1.0"

# 3. the layout Bubblewrap expects, in addition to the one above
cp -r cmdline-tools/latest/bin cmdline-tools/latest/lib .
```

Then point `~/.bubblewrap/config.json` at both, with **escaped** Windows paths —
it is JSON, so a single backslash is a broken escape and the error you get is
`Bad escaped character in JSON at position 15`:

```json
{"jdkPath":"C:\Users\you\.bubblewrap\jdk\jdk-17.0.11+9",
 "androidSdkPath":"C:\Users\you\.bubblewrap\android_sdk"}
```

## 3. Generate the project, and the keystore

The keystore first, because the build wants it:

```
keytool -genkeypair -alias android -keystore android.keystore   -storetype PKCS12 -keyalg RSA -keysize 4096 -validity 10950   -dname "CN=Your Name, O=Al-Mauiza, L=London, ST=Ontario, C=CA"
```

10950 days is thirty years. Play requires the certificate to outlast 2033, and
a key you have to replace is a key you have to ask Google to reset.

Then the project. `twa-manifest.json` is already in this repo (`store/`) and in
`../mushaf-android/`, so there is nothing to answer interactively:

```
cd ../mushaf-android
npx @bubblewrap/cli update --skipVersionUpgrade
```

`update` regenerates `app/build.gradle` from `twa-manifest.json`. **It will
overwrite the signing block described below, so re-apply that after every
`update`.**

## 3a. Two fixes to the generated Gradle

**`splashScreenFadeOutDuration: ,`** — Bubblewrap emits the key with no value
when `twa-manifest.json` omits it, and Groovy will not parse that. Fixed at
source by adding `"splashScreenFadeOutDuration": 300` to `twa-manifest.json`,
so a regeneration stays correct.

**Signing is declared in Gradle, not left to Bubblewrap.** `bubblewrap build`
shells out to `gradlew.bat` without a `./`, and Windows does not have the
current directory on `PATH`, so it fails with `'gradlew.bat' is not recognized`
before it compiles anything. Rather than work around that, `app/build.gradle`
reads a `keystore.properties` at the project root and declares a real
`signingConfig`, so plain Gradle produces an already-signed bundle:

```
keystore.properties        # gitignored
  storeFile=android.keystore
  storePassword=…
  keyAlias=android
  keyPassword=…
```

Note `storeFile=android.keystore`, not `../android.keystore`: it is resolved
with `rootProject.file()`, and the root project *is* `mushaf-android`.

## 3b. Build

```
export JAVA_HOME=~/.bubblewrap/jdk/jdk-17.0.11+9
export ANDROID_HOME=~/.bubblewrap/android_sdk
./gradlew.bat bundleRelease assembleRelease --no-daemon
```

Then check what you are about to upload, rather than assuming:

```
apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
aapt2 dump badging app/build/outputs/apk/release/app-release.apk   | grep -E "package:|application-label:|uses-permission|SdkVersion"
```

The label must read `Al-Mau'iza — الموعظة`. If it reads `Al-Mau'iza`, do not
"fix" the escaping in `build.gradle`: Bubblewrap writes `'Al-Mau\'iza'`
on purpose, because Groovy unescapes it to `Al-Mau'iza` and **AAPT then wants
that backslash** — an apostrophe is a reserved character in an Android string
resource. Removing it does not produce a nicer name; it fails the build at
`mergeReleaseResources` with `Can not extract resource from ParsedResource`.

The permission list should be one line, the framework's own
`DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. There is no `INTERNET`, and that is
correct — a TWA hands the URL to Chrome and does no networking of its own.

## 4. First upload

In the Play Console: create the app, then **Testing → Closed testing** and
upload the AAB there, not to production.

A new personal developer account must run a closed test with **12 testers who
stay opted in for 14 continuous days** before it can apply for production
access. This is the longest part of the whole process, so start it as soon as
the AAB builds — everything else on the listing can be filled in while it runs.

## 5. Digital Asset Links — the step that decides whether it looks like an app

Until this is right, the TWA opens with a browser address bar across the top.

Play re-signs every upload with its own key, so the fingerprint Android checks
at runtime is the **App signing key**, not your upload key. Get it from
**Play Console → Setup → App integrity → App signing key certificate →
SHA-256 certificate fingerprint**.

Then publish this at the **origin root** — not under `/mushaf/`:

`https://notyousha.github.io/.well-known/assetlinks.json`

That path belongs to a user-pages repo, which does not exist yet. Create it:

```
gh repo create NotYousha/notyousha.github.io --public --add-readme
git clone https://github.com/NotYousha/notyousha.github.io
cd notyousha.github.io
mkdir -p .well-known
# put assetlinks.json here — template in store/assetlinks.template.json
git add -A && git commit -m "Digital Asset Links for the Play app" && git push
```

Then enable Pages for that repo (Settings → Pages → deploy from `main`), and
check the file answers:

```
curl https://notyousha.github.io/.well-known/assetlinks.json
```

Include **both** fingerprints — the app signing key and your upload key — so
that a locally built APK verifies too. `store/assetlinks.template.json` has the
shape; replace the two placeholders.

Verify from a connected phone:

```
adb shell am start -a android.intent.action.VIEW -d "https://notyousha.github.io/mushaf/" io.github.notyousha.mushaf
```

No address bar means it verified.

## 6. Updating later

- **Content, layout, data, new reciters** — deploy to Pages as usual. Nothing
  to do on Play; the service worker picks it up, and it waits until nothing is
  playing or downloading before it hands the page over.

  That last clause was written here before it was true. `registerType` was
  `'autoUpdate'`, and under that setting vite-plugin-pwa's client wires the
  worker's `activated` event straight to `window.location.reload()` and never
  calls `onNeedRefresh` at all — which is the branch `src/pwa.ts`'s
  `reloadWhenIdle` hangs off. So the careful logic was unreachable and every
  deploy hard-reloaded the app the next time it was looked at. In a browser tab
  that is a flicker. In a TWA there is no address bar and no tab, so a
  recitation stopping and the player emptying reads as a crash. It is
  `'prompt'` now, with `skipWaiting` dropped, and the app asks for the page
  when the moment is safe.
- **Icons, name, orientation, anything in the manifest Bubblewrap baked in** —
  `npx @bubblewrap/cli update`, bump `versionCode` in `twa-manifest.json`,
  rebuild, upload. `versionCode` must increase every time; `YYMMDDnn`
  (e.g. `26082601`) is monotonic by construction and says when it was cut.

---

### The monochrome icon, and why it is blank above

Android uses a monochrome icon for the notification small-icon — which for this
app is on screen constantly, since audio is almost always playing. There isn't
one in the repo: it needs a white-on-transparent silhouette of the wordmark,
512×512 RGBA, and `scripts/make-app-icons.py` does not generate it. Without it
Android draws a grey blob in the status bar.

It is worth doing before the production release rather than the closed test.
The generator already computes the glyph mask it would need — see `squircle`
and `place` in that script.

### On the theme colour

`theme_color` in the manifest is read once, at install, for the system bars. The
app's theme picker re-stamps `<meta name="theme-color">` at runtime and the
browser honours it, but an installed TWA's system bars will not follow — so
someone using the black Kiswah theme gets a cream status bar. Fixing that
properly needs the native side. It is cosmetic and it is not worth blocking a
release on.
