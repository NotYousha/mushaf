# Building the Android app

The app ships to Play as a **Trusted Web Activity** — a thin Android wrapper
around the deployed site. The AAB is a couple of megabytes; the app itself is
the site, so a fix deployed to Pages reaches everyone without a Play release.
That is the main reason to prefer it here over a rewrite.

Two things are deliberately not done for you below.

**The signing key is your app's identity.** Whoever holds the upload keystore
can publish updates, and losing it means asking Google to reset it. It should
be created by you, with a password only you have, and backed up somewhere that
is not this repository and not only this machine. So the keystore step is yours.

**Bubblewrap's setup is interactive** — it offers to download its own JDK 17
and Android SDK on first run, and prompts for the keystore password. It cannot
be driven from a non-interactive shell, which is why these are commands to run
rather than a script that was already run.

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

## 2. Generate the project and your keystore

```
mkdir ../mushaf-android && cd ../mushaf-android
npx @bubblewrap/cli init --manifest https://notyousha.github.io/mushaf/manifest.webmanifest
```

Answer:

| Prompt | Answer |
| --- | --- |
| Install the JDK / Android SDK | **Yes** to both |
| Domain | `notyousha.github.io` |
| URL path | `/mushaf/` |
| Application name | `Al-Mau'iza — الموعظة` |
| Short name | `Al-Mau'iza` |
| Application ID | `io.github.notyousha.mushaf` |
| Display mode | `standalone` |
| Orientation | `portrait` |
| Status bar colour | `#f6f0e6` |
| Splash colour | `#f6f0e6` |
| Icon URL | `https://notyousha.github.io/mushaf/mark-512.png` |
| Maskable icon URL | `https://notyousha.github.io/mushaf/mark-maskable-512.png` |
| Monochrome icon URL | leave blank — see the note at the end |
| Include support for Play Billing | **No** |
| Request geolocation permission | **No** |
| Signing key: create new | **Yes**, and choose a password you record safely |

The application id cannot change after the first upload, so decide it now.
`io.github.notyousha.mushaf` matches the origin the app is actually served
from; if you later move to a custom domain, keep this id — it is a name, not
an address, and changing it would be a different app on the store.

## 3. Build

```
npx @bubblewrap/cli build
```

Produces `app-release-bundle.aab` (upload this) and `app-release-signed.apk`
(useful for installing on your own phone to test). Also prints the SHA-256
fingerprint of your **upload** key — keep it, but note it is not the one that
matters most; see step 5.

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
  to do on Play; the service worker picks it up, and it now waits until nothing
  is playing before it reloads.
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
