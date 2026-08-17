# Mushaf — Offline Quran Player

**Date:** 2026-08-17
**Status:** Approved design, ready for implementation planning

## Purpose

A phone app for listening to the complete Quran offline, recited by Sheikh Yasser Al-Dosari
(المصحف المرتل للقارئ ياسر الدوسري, Hafs 'an Asim, murattal). The driving use case is listening
with no signal — in the car, at the masjid, on a commute. Offline is the feature, not a fallback.

## Success criteria

1. All 114 surahs playable with the device in airplane mode.
2. Audio continues when the phone is locked or the app is backgrounded, with working lock-screen controls.
3. Closing and reopening the app resumes the exact surah and timestamp.
4. Audio obtained from anywhere — not just the built-in catalog — can be played by the app.

## Platform decision

Installable PWA (Vite + React + TypeScript), targeting Android and iOS.

Rejected alternatives:
- **Native (React Native/Expo)** — better background audio, but adds a build toolchain and store
  friction for marginal gain over Media Session API.
- **Desktop** — fails the actual use case (car, masjid).
- **Synced multi-device** — requires a backend and accounts; not worth it for a single user.

Play Store submission is deliberately **phase 2**. The PWA packages to a TWA via Bubblewrap when
wanted, so this is a packaging step rather than a rewrite. Deferring it avoids the $25 developer
account, the ~12-tester/14-day closed test for new personal accounts, the hosted privacy policy,
and the audio-hosting/bandwidth question — none of which should block a working app.

## Verified source facts

Confirmed by direct request on 2026-08-17, not assumed:

| Property | Value |
|---|---|
| Catalog API | `https://www.mp3quran.net/api/v3/reciters?language=ar` (requires `www.`; bare host 301s) |
| Reciter | id `92`, ياسر الدوسري — حفص عن عاصم - مرتل |
| Audio server | `https://server11.mp3quran.net/yasser/{NNN}.mp3` (zero-padded, `001`–`114`) |
| Coverage | 114/114 surahs, all resolve |
| Total size | 1.34 GB (1373 MB) |
| Largest / smallest | Al-Baqarah 110.6 MB / Al-Ikhlas 185 KB |
| CORS | `Access-Control-Allow-Origin: *` — fetchable from a browser, no proxy needed |
| Range requests | `206 Partial Content` with `content-range` — resumable downloads work |
| Quran text | `https://api.alquran.cloud/v1/quran/quran-uthmani` — 2.01 MB, 6236 ayahs, CORS open |

### Known open question: which recording

mp3quran lists exactly one Hafs murattal for this reciter. A search in both Arabic and English
found no separately published "new mushaf" MP3 set; sources that surfaced (IslamWay, SurahQuran,
Assabile, TvQuran, Archive.org) all appear to carry the same established recitation. IslamWay's
HQ listing at ~1405 MB against the 1373 MB measured here suggests the same recording.

The newer recitation appears to circulate on YouTube without an MP3 release. **YouTube is not a
supported source**: there is no API that returns audio, extraction violates YouTube's terms, and
it would fail Play review. The app will not implement it.

This is resolved by design rather than by sourcing — see the source abstraction below. The user
should verify by ear whether the catalog recording is the desired one; if not, any files obtained
legitimately can be imported and the app treats them identically.

## Architecture

### Source abstraction — the load-bearing decision

Nothing downstream knows where audio came from.

```ts
interface AudioSource {
  id: string
  name: string
  fetchSurah(n: number, onProgress: (loaded: number, total: number) => void): Promise<Blob>
}
```

Two v1 implementations:

- **`CatalogSource`** — chunked ranged fetch from `server11.mp3quran.net`.
- **`ImportSource`** — files chosen from the device via `<input type="file" multiple>`.

Both write to the same IndexedDB store. The player, queue, resume, and lock-screen integration
are source-agnostic. A future mushaf release is a new `AudioSource` or a plain import, requiring
no changes to playback, storage, or UI.

**Import filename matching:** parse `001.mp3`, `1.mp3`, `01 - Al-Fatiha.mp3`, and Arabic surah
names to a surah number. Unmatched files fall back to manual assignment — never silently dropped
or misfiled.

### Storage

| Data | Store | Size |
|---|---|---|
| Audio blobs | IndexedDB, key `(sourceId, surahNumber)` | ≤ 1.34 GB |
| Quran text | bundled JSON asset | 2 MB |
| Playback position, download state, bookmarks | IndexedDB | negligible |

Audio lives in IndexedDB rather than the Cache API so it can be queried, sized, and deleted per
surah. The service worker precaches only the app shell; it never touches audio.

**Quota handling.** On first run, request `navigator.storage.persist()` to reduce eviction risk.
Before any bulk download, read `navigator.storage.estimate()` and show real available space.
Per-surah download is the default. "Download all" is enabled only when `quota - usage` exceeds
**2.0 GB** (1.5× the mushaf, leaving headroom), and is Wi-Fi-gated with an explicit 1.34 GB
warning. Below that threshold the button is disabled with the shortfall shown, and per-surah
download remains available.

**Eviction is a normal condition, not an error.** iOS will sometimes drop data. On play, if the
expected blob is absent, surface it plainly and offer one-tap re-download. Never fail silently.

### Downloads

Chunked HTTP Range requests, which the host supports. This matters most for the large surahs: a
single-shot 110 MB fetch on mobile fails often enough that resumability is the difference between
working and not. A broken chunk resumes rather than restarting the surah.

- Queue with a fixed concurrency of 3 downloads, pausable and resumable
- Chunk size 2 MB, so a failed chunk costs at most 2 MB of re-fetching
- Completed files verified against expected byte length before being marked complete
- Partial state persisted so an app close mid-download loses nothing

### Playback

Single `<audio>` element fed blob object URLs.

- **Media Session API** — lock-screen artwork, surah title, reciter, prev/next/seek handlers
- **Continuous play** — auto-advance on `ended`
- **Repeat modes** — off / repeat-one (for memorization) / repeat-all
- **Sleep timer**
- **Resume** — `{surah, currentTime}` persisted on throttled `timeupdate` (~5s) and on pause and
  `visibilitychange`; restored at launch

### Text view

Uthmani text for the current surah, bundled offline.

**Constraint stated up front:** the catalog serves whole-surah audio files, so ayah-level
highlight sync is not possible. Text is static. Per-ayah sync would require a per-ayah audio
source and is out of scope.

## Screens

1. **Surah list** — 114 entries with Arabic and English name, ayah count, download state, size
2. **Player** — full-screen controls, seek bar, repeat, sleep timer
3. **Text** — Arabic text for the current surah
4. **Storage settings** — usage vs quota, download all, import files, delete per surah, clear all

## Error handling

| Condition | Behavior |
|---|---|
| Network failure mid-download | Mark partial, resume from last good byte |
| `QuotaExceededError` | Explain clearly, show usage, prompt to delete surahs |
| Blob evicted by OS | Detect on play, offer one-tap re-download |
| Incomplete/corrupt file | Byte-length check before marking complete; re-fetch on mismatch |
| Catalog host unreachable | Downloaded surahs still play; only new downloads blocked |
| Import file unmatched | Manual surah assignment, never silent |

## Testing

**Unit** — filename→surah matcher (the highest-bug-density component), download resume logic,
queue and repeat state machine.

**Integration** — fake IndexedDB, mocked fetch with real range-request semantics including
mid-stream failure.

**Manual device checklist** — the things unit tests cannot cover:
- Playback in airplane mode
- Lock-screen controls on Android and iOS
- Audio continuity when backgrounded
- Data survival across an iOS reboot

## Out of scope for v1

Accounts, cross-device sync, translations, multiple reciters, ayah-level sync, Play Store
submission, YouTube ingestion.
