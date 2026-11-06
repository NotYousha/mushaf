# Al-Mau'iza build plan for branch `reading-surfaces`

## Checked before planning

I checked these in the repo before writing the plan:

- **The catalogue is generated, so new reciters go in the script.** `scripts/refresh-catalog.mjs` writes `data/catalog.json`, and `.github/workflows/refresh.yml` runs it every Monday. Any reciter added to `catalog.json` by hand will be wiped on the next Monday run, so every reciter and URL change belongs in the script's host map (Luhaidan is at line 117).
- **The script trusts Last-Modified, not ETag.** It notes that ETag and Content-Range are not CORS-safelisted, so the app relies on `Last-Modified` and `If-Range`. Every new host must send `Last-Modified`. All the probes below report it.
- **Nothing builds or tests the branch.** `deploy.yml` runs tsc, vitest and the build only when `master` is pushed. Since nothing can be built locally on the laptop, item 1 adds a check that runs on the branch.
- **Confirmed in the code:** `en-itani` is at `data/translations.json:13`. `requestPersistence()` already runs at boot (`App.tsx:514`). `SPEEDS = [1, 1.25, 1.5, 0.75]` is at `App.tsx:173`. None of the 14 proposed reciter folders is in the catalogue yet. Luhaidan has 115 `server8` URLs.

## Debates resolved

These are the places where the two sides disagreed by a real margin.

| Item | Verdict |
|---|---|
| **speed-1** (move the clock out of App). The advocate called it the root cause of the lag; the skeptic called it risky with no local tests. | **Do it tonight, but last.** Use the same `time` value and only change who subscribes to it. Branch CI checks the types. Keep it as one commit so it can be reverted alone. |
| **speed-3** (content-visibility on ayahs). Cheap, but it may break follow-scroll centring, and it caused a bug before (`desktop.css:420`). | **Next, not tonight.** Ship it only after the follow chip (speed-41) exists and centring is checked on a phone. |
| **ui-6 and speed-33** (automatic glass tiers). The skeptic said a 60-frame benchmark on first run causes the very jank it measures. | **No benchmark.** Use `deviceMemory` and `hardwareConcurrency` only, always turn tilt off while scrolling or playing, and add a manual override in More. |
| **listen-6** (Husary with "free word sync"). The sync claim is unproven. | **Split it.** The audio goes in tonight. Timings follow later, only if the QUL `surah_segments` files match the quranicaudio files. |
| **listen-42** (keep the ayah when switching reciter). The "same fraction of the surah" fallback is wrong for reciters with different pacing. | **Drop the fraction fallback.** Keep the same ayah when both reciters are timed, otherwise start at 0. |
| **market-1** (call storage.persist). Its premise is false: the call already runs at boot. | **Merge it into speed-31**, which only adds the status line and a second request after the first finished download. |
| **learn-1** (preview flag for the held-back tabs). High leverage, but the tabs were held back on purpose. | **The owner decides.** It goes in Later. |
| **market-2 and learn-27** (backup file). Opening a file straight into the TWA needs `file_handlers`, which Bubblewrap supports poorly. | **Build it once:** export through the share sheet plus an Import button. File handlers wait for an AAB rebuild. |
| **Duplicates** | Text size: ui-14, speed-40 and market-23 become one control. Home suggestions: ui-20, listen-32 and market-20 become one row. Starter pack: market-12 and listen-45 become one pack. Resume: market-29 and learn-25 become one store. |
| **listen-21** (A to B repeat). It only works for timed reciters, and setting a range by long-press is hard to discover. | **Next.** Use an explicit "Repeat range" button in the ayah menu instead of a hidden long-press. |
| **listen-27** (speed options). Remembering speed per reciter is scope creep. | **Add the wider speed range and a long-press picker only.** No per-reciter memory. |

## 1. Tonight (12 items, each shippable on its own, in this order)

### T1. CI check on the branch (S)
- **Build:** a new `.github/workflows/check.yml`. On push to `reading-surfaces` it runs `npm ci`, `npx tsc --noEmit`, `npx vitest run` and `npm run build`, with no deploy step.
- **Files:** `.github/workflows/check.yml`
- **Verify:** push, then `gh run watch`.
- **Risk:** none. Every later item depends on it for verification.

### T2. Remove Clear Quran (learn-18) (S)
- **Build:**
  - Remove `en-itani` from the translations data and its build script.
  - When prefs load, move anyone on `en-itani` to Saheeh International.
  - Show a one-time localised note, recorded by a pref flag.
- **Files:** `data/translations.json`, `scripts/build-translations.mjs`, `src/mushaf/translations.ts`, `src/db/prefs.ts`, `src/i18n/*`
- **Verify:**
  - `grep -r itani src data public` returns nothing.
  - Add a vitest for the migration.
  - CI passes.
- **Risk:** low. Check that no cached `public/` translation file still ships it.

### T3. 14 new reciters and the Luhaidan host fix (listen-1 to 5, 7 to 9, 11 to 15, 17) (S, data only)
- **Build:**
  - Add host entries to `refresh-catalog.mjs` for the verified reciters (table in section 4).
  - Set `fallbackUrl` where a second host exists.
  - Tag Husary Al-Mu'allim as "المعلم / Teaching" and Abdul Basit Mujawwad as "مجود / Mujawwad".
  - Change Luhaidan's host from `server8.mp3quran.net/lhdan/` to `cdn.mp3quran.net/audio/muhammad-luhaidan/r1/`.
  - Map the roster ids that already exist (hudhaify, ghamdi-saad, thubaiti, qasim, muhanna) to the bundled portraits.
- **Files:** `scripts/refresh-catalog.mjs`, `data/imams.json`, `data/reciter-frames.json`, then the regenerated `data/catalog.json`
- **Verify:**
  - Run `node scripts/refresh-catalog.mjs`. It only makes network calls and uses little RAM, and it probes Range plus the validator for each reciter.
  - The diff should only add reciters and change Luhaidan's URLs.
  - CI vitest passes.
- **Risk:** a host's `Last-Modified` may fail the script's check. If so, drop that reciter rather than weakening the check. Use only Saad Al-Ghamdi's `complete/` folder, never `hidayah/`.

### T4. Skip the splash on TWA cold starts (speed-13) (S)
- **Build:** if `matchMedia('(display-mode: standalone)')` matches, do not show the splash. In the browser, dismiss it once the catalogue and the saved position are ready, with the current 700 ms as a cap rather than a floor.
- **Files:** `src/ui/Splash.tsx`, `src/App.tsx:1853`
- **Verify:** CI passes. Then on the owner's phone, a cold start shows only the Android launch screen.
- **Risk:** low.

### T5. Fix the leaked interval in playRange (speed-6) (S)
- **Build:**
  - Also resolve on `pause`, `emptied` or a change of load token.
  - Always clear the interval and remove the listener in a `finally`.
- **Files:** `src/App.tsx:865-895`
- **Verify:** vitest with fake timers. Start a range, pause it, and confirm no interval remains.
- **Risk:** low. It only affects the Hifz and fork drills, which are behind the flag.

### T6. Translation rows re-render only when the ayah changes (speed-2) (S)
- **Build:**
  - Add `memo(AyahRow)` with props `(ayah, isNow, arabic, translation)`.
  - Compute `active` from `time` with `useMemo`, so rows only see the change of ayah index.
- **Files:** `src/ui/TranslationView.tsx:39, 139-153, 271-331`
- **Verify:** CI passes. On a phone, Al-Baqarah scrolls smoothly during playback. A React Profiler check is optional.
- **Risk:** low.

### T7. Memoised rows in SurahList during downloads (speed-7) (S)
- **Build:** `memo(SurahRow)` taking primitive props `pct`, `have`, `held` and `active`.
- **Files:** `src/ui/SurahList.tsx:88-175`
- **Verify:** CI passes. During "download all", only the active row repaints.
- **Risk:** low.

### T8. One text-size control (ui-14, speed-40 and market-23 merged) (S)
- **Build:**
  - An A−/A+ glass popover in the Translation header with five Arabic steps, five translation steps, a line-height setting, and toggles to hide the Arabic or the translation.
  - Every control only sets CSS variables `--ayah-scale` and `--tr-scale` on the root.
  - Save the values to prefs and copy them to localStorage, so they are applied on boot without a flash of the default size.
  - Leave the "Large" preset in onboarding until Next item N14.
- **Files:** `src/ui/TranslationView.tsx:218-268`, `src/ui/theme.css:2358-2392`, `src/ui/theming.ts`, `src/db/prefs.ts`
- **Verify:** CI passes. Check on a phone that the popover's glass never sits behind ayah text.
- **Risk:** low.

### T9. Download queue fixes (speed-27, speed-19 and speed-21) (S)
- **Build:**
  - Add `queue.cancelAll()` and make Stop call it.
  - Compute "X of Y" per reciter from `QueueState`.
  - Show Pause and Resume buttons using the existing `pauseAll` and `resumeAll`.
  - Listen for `offline` and `online` to pause and resume the queue automatically.
- **Files:** `src/download/queue.ts`, `src/App.tsx:389, 2252-2281`
- **Verify:** vitest on the queue for cancelAll across reciters and offline/online pause and resume. CI passes.
- **Risk:** low to medium. Make sure the automatic resume does not override a pause the user chose.

### T10. Fail fast when offline and the surah is not saved (speed-20) (S)
- **Build:**
  - If `!navigator.onLine` and there is no saved copy, show a localised "Not saved, you're offline" message with two actions: "Download when online" (queues it) and "Show saved surahs".
  - Keep the 15 s timeout as a backstop, because a captive portal reports online.
- **Files:** `src/player/engine.ts:202-206, 234-310`, `src/i18n/*`
- **Verify:** vitest that stubs `navigator.onLine`.
- **Risk:** low.

### T11. Sleep timer that stops at an ayah or the end of a surah (listen-25) (S)
- **Build:**
  - Options: end of this ayah (timed reciters only), end of the surah (all reciters), after N ayahs (timed only), or 15, 30, 45 or 60 minutes.
  - Check `currentTime` in `timeupdate` instead of using a long `setTimeout`.
  - Ramp the volume down over the last 20 s.
  - Call `pause()` instead of `stop()`, so the resume position is kept.
- **Files:** `src/App.tsx` (the sleepAt effect, about line 1193), `src/player/engine.ts`
- **Verify:** vitest for the boundary logic. Test on a phone with the screen locked.
- **Risk:** low. Hide the ayah-based options for reciters without timings.

### T12. Take the playback clock out of App, and move the scrubber knob onto transform (speed-1 and speed-4) (M)
- **Build:**
  - A new `src/player/clock.ts` external store.
  - `timeupdate` writes to the store instead of `setTime`.
  - Only the time labels, the scrubber, the active-ayah logic and TranslationView read it, through `useSyncExternalStore`.
  - Move the knob to `transform: translateX(calc(var(--pct) ...))`.
- **Files:** `src/App.tsx:196, 576, 2347, 2412, 2834-2855`, `src/player/clock.ts`, `src/ui/theme.css`
- **Verify:** CI checks the types. Then on a phone, play Al-Baqarah and confirm the home and player screens no longer stutter.
- **Risk:** medium, because App.tsx is 3,000 lines. Make it one isolated commit so it can be reverted alone if the owner sees anything strange.

## 2. Next (20 items)

1. **Safer update reloads (speed-32).** Reload only while the page is hidden, after saving the tab and scroll position to sessionStorage, and dedupe the intervals in `pwa.ts:57-73`.
2. **Jump by reference (market-5).** Typing "2:255", "٢:٢٥٥", "kahf 10", "p293" or "juz 30" jumps straight there, through a parser in `src/catalog/search.ts`. This replaces learn-23.
3. **Resume points (market-29 and learn-25 merged).** One position per reciter and surah, rewound by 3 s on return, and one automatic last-read position per surface. Write only on pause or scroll idle, never on every tick.
4. **Keep the ayah when switching reciter (listen-42).** Both reciters timed: same ayah. Otherwise start at 0, with no fraction fallback.
5. **Stop reading each finished download back into a Blob (speed-8).** Check completeness by counting chunks over the key range instead, and return void.
6. **content-visibility on `.tayah` (speed-3).** Only after item 10 below, and after a centring test on a phone.
7. **12 KB Arabic text per surah instead of the 2.6 MB layout (speed-16).** This must land before more translations are added (learn-17).
8. **Glass quality tiers (speed-33 and ui-6 merged).** Use device hints only, turn tilt off while scrolling or playing, and add an override in More.
9. **Wider speed range (listen-27).** Add 0.5, 0.85 and 2.0, a long-press picker, and an explicit `preservesPitch`.
10. **"Follow recitation" chip (speed-41).** Wire up the existing `rearm()`.
11. **One time-aware row on Home (ui-20, listen-32 and market-20 merged).** Al-Kahf from Thursday Maghrib to Friday Maghrib, with a resume point; Al-Mulk after Isha; Al-Waqi'ah at Maghrib; Ya-Sin in the morning. One chip at a time, no notifications.
12. **Backup and restore (learn-27 and market-2 merged).** Export a `.mauiza` JSON through `navigator.share` with a file, plus an Import button. Audio is excluded.
13. **Juz Amma starter pack (market-12 and listen-45 merged).** One opt-in card after onboarding and a "Download Juz 30" button on each reciter, showing the size from catalogue bytes before starting.
14. **Onboarding ends on a recitation playing (market-13).** "Choose a voice" with four faces and 10 s Fatihah previews streamed by Range (no download), plus the "Large" text preset.
15. **Show whether storage is protected (speed-31 with market-1).** A status line in Downloads, and a second `persist()` request after the first finished download.
16. **Batch the startup reads (speed-12).** One `getAll` on prefs and `Promise.all` for the independent reads. Restore the position before scanning downloads.
17. **A to B ayah repeat (listen-21).** A "Repeat range" action in the ayah menu, a count and a gap, and seek-based so it keeps running with the screen off. Timed reciters only.
18. **Focus reading in Translation (learn-35).** Tap to hide the chrome, plus the Screen Wake Lock API. With no glass on screen, the GPU does less work.
19. **Full-text search over the Arabic and translations (learn-21).** Run it in a Web Worker with `foldArabic`, built lazily after item 7.
20. **Husary word timings (the second half of listen-6).** Compare the QUL `surah_segments` against the quranicaudio files. Ship `data/timings-husary.json` only if they match.

## 3. Later, or waiting on the owner

- **Mushaf and Hifz preview flag (learn-1).** The owner chose to hold these tabs back. Ask whether a "Preview" switch in Settings is acceptable before building it.
- **Taraweeh night mode (listen-34).** Ramadan 1448 starts around 8 Feb 2027, so this needs building in January. It needs a per-night juz map onto the Haram-year recordings. The owner should confirm the night numbering, since the Makkah and Madinah portions differ.
- **QuranEnc translations (learn-17).** Licensed with attribution. It waits for Next item 7 (per-surah text), and the owner must approve the attribution wording and the choice of languages.
- **Store listing leading with "No ads. No account. Works offline." (market-15).** Changes are made in the Play Console by the owner, with the screenshot order Reciters, then Talqeen or Veil, in the AR, UR and ID listings.
- **IndoPak script.** Blocked on the font permission email.
- **Opening `.mauiza` files straight into the app.** Needs `file_handlers` in an AAB rebuild. The keystore exists only on this laptop.
- **Clear Quran.** Licensing is permanently blocked. T2 removes it and it does not come back.

## 4. New reciters (all 3-digit numbering, 001 to 114)

None of these could be re-probed tonight. The "Range + validator" column records what the debate probes reported (a 206 response plus `Last-Modified`). T3 re-checks all of them through `refresh-catalog.mjs` before they ship.

| Reciter | Primary base URL | Fallback | Range + validator |
|---|---|---|---|
| Ali Al-Hudhaify | `https://download.quranicaudio.com/quran/huthayfi/` | none | yes (206, Last-Modified, ACAO *) |
| Saad Al-Ghamdi | `https://download.quranicaudio.com/quran/sa3d_al-ghaamidi/complete/` | none | yes (206, Last-Modified) |
| Husary Al-Mu'allim (Teaching) | `https://download.quranicaudio.com/quran/husary_muallim/` | none | yes (206, Last-Modified) |
| Abdul Basit (Murattal) | `https://download.quranicaudio.com/quran/abdul_basit_murattal/` | `https://cdn.mp3quran.net/audio/abdulbasit-abdulsamad/r3/` | yes (206, Last-Modified, ACAO *) |
| Abdul Basit (Mujawwad) | `https://download.quranicaudio.com/quran/abdulbaset_mujawwad/` | none | yes (206, Last-Modified) |
| Abu Bakr Ash-Shatri | `https://download.quranicaudio.com/quran/abu_bakr_ash-shaatree/` | `https://cdn.mp3quran.net/audio/abubakr-shatri/r1/` | yes (206, Last-Modified; fallback sends an ETag) |
| Abdul Bari Ath-Thubaiti | `https://download.quranicaudio.com/quran/thubaity/` | none | yes (206, Last-Modified, ACAO *) |
| Abdul Muhsin Al-Qasim | `https://download.quranicaudio.com/quran/abdul_muhsin_alqasim/` | none | yes (206, Last-Modified, ACAO *) |
| Khalid Al-Muhanna | `https://cdn.mp3quran.net/audio/khalid-mohanna/r1/` | none | yes (206, ETag + Last-Modified, headers exposed) |
| Mahmoud Khalil Al-Husary (Murattal) | `https://download.quranicaudio.com/quran/mahmood_khaleel_al-husaree/` | `https://cdn.mp3quran.net/audio/mahmoud-husary/r1/` | yes (206, Last-Modified, ACAO *) |
| Ahmad Al-Ajmy | `https://download.quranicaudio.com/quran/ahmed_ibn_3ali_al-3ajamy/` | `https://cdn.mp3quran.net/audio/ahmad-ajmi/r1/` | yes (206, Last-Modified; fallback sends an ETag) |
| Nasser Al-Qatami | `https://cdn.mp3quran.net/audio/nasser-qatami/r1/` | `https://download.quranicaudio.com/quran/nasser_bin_ali_alqatami/` | yes (206, ETag + Last-Modified, headers exposed) |
| Khalid Al-Jileel | `https://cdn.mp3quran.net/audio/khalid-jalil/r1/` | none | yes (206, ETag + Last-Modified, headers exposed) |
| Fares Abbad | `https://download.quranicaudio.com/quran/fares/` | `https://cdn.mp3quran.net/audio/fares-abbad/r1/` | yes (206, Last-Modified); the fallback is listed but was not probed |
| Muhammad Al-Luhaidan (existing, host change) | `https://cdn.mp3quran.net/audio/muhammad-luhaidan/r1/` (replaces `server8.../lhdan/`, which now 301s) | none | yes (206, ETag); Last-Modified must be confirmed by refresh-catalog |

Files that matter: `C:\Users\yoush\mushaf\scripts\refresh-catalog.mjs` (reciter hosts, Luhaidan at line 117), `C:\Users\yoush\mushaf\.github\workflows\deploy.yml` (CI runs only on master), `C:\Users\yoush\mushaf\data\translations.json` (en-itani at line 13), `C:\Users\yoush\mushaf\src\App.tsx`.