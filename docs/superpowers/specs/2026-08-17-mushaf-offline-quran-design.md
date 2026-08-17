# Mushaf — Offline Quran Player

**Date:** 2026-08-17
**Status:** Approved design, revised after source verification

## Purpose

A phone app for listening to the Quran offline, recited by Sheikh Yasser Al-Dosari in the mushaf
produced by المركز السعودي للتلاوات القرآنية والأحاديث النبوية (the Saudi Center for Quranic
Recitations, under the Saudi Broadcasting Authority). The driving use case is listening with no
signal — car, masjid, commute. Offline is the feature, not a fallback.

## Success criteria

1. Every released surah plays with the device in airplane mode.
2. Audio continues when the phone is locked or backgrounded, with working lock-screen controls.
3. Closing and reopening resumes the exact surah and timestamp.
4. Newly released surahs appear in the app without a code change.
5. Audio obtained elsewhere can be imported and played.

## Critical context: this mushaf is incomplete and still being recorded

**Only 37 of 114 surahs exist** — a contiguous run, Al-Fatiha (1) through As-Saffat (37).

This was confirmed from five independent angles on 2026-08-17:

1. `tilawatalharamain.com/quran/c/64`, the dedicated index for this exact mushaf — 37 entries, no pagination.
2. `yaldosry.com` — the same 37 surahs.
3. An archive.org uploader mirroring the series — 37 surah items.
4. Search summaries describing the mushaf as "37 recitations... released sequentially."
5. إذاعة القرآن الكريم (official Saudi Quran Radio) announcing the mushaf is **broadcast daily at
   9:30 pm**, episode by episode.

Surahs 38–114 are not withheld or hard to find — **they have not been recorded and aired yet.**
The recitation is being released on radio and the Center's YouTube channel as it is produced, and
file mirrors follow behind.

**Design consequence:** the catalog is not a fixed list of 114. It is a growing list, currently 37.
The app must treat surah availability as data, not as a constant, so the remaining surahs appear
as the Center publishes them.

**YouTube is not a supported source.** No API returns audio; extraction violates YouTube's terms
and would fail Play review. The app will not implement it. This costs nothing in coverage — the
YouTube channel carries the same 37 surahs, not more.

## Gap policy: new mushaf only

Surahs 38–114 display as "not yet released" and are visibly inert — not errors, not empty rows.
They light up automatically when the catalog reports them.

Rejected: falling back to the reciter's older mp3quran recording for unreleased surahs. It is a
different recording, and silently mixing takes is worse than an honest gap.

## Platform

Installable PWA (Vite + React + TypeScript), Android and iOS.

Play Store submission is **phase 2**. The PWA packages to a TWA via Bubblewrap, so shipping is a
packaging step, not a rewrite. Deferring it avoids the $25 developer account, the closed-test
requirement for new personal accounts, a hosted privacy policy, and the audio-hosting question —
none of which should block a working app.

## Verified source facts

Confirmed by direct HTTP request, not assumed:

| Property | Value |
|---|---|
| Released surahs | 37 of 114 (1–37, contiguous) |
| Total size, released | **1.79 GB** |
| Projected full 114 | **~4.5 GB** at this bitrate |
| Largest | Al-Baqarah **218 MB**; An-Nisa 118 MB; Al-Imran 113 MB |
| Primary host | `archive.org` — `Access-Control-Allow-Origin: *`, `Accept-Ranges: bytes`, `206 Partial Content` |
| Quran text | `api.alquran.cloud/v1/quran/quran-uthmani` — 2.01 MB, 6236 ayahs, CORS open |

### CORS trap — do not undo this

`media.altilawat.com` hosts 36 of the 37 surahs and **sends no `Access-Control-Allow-Origin`
header**. A browser cannot fetch it, regardless of range support. The catalog therefore prefers
`archive.org` mirrors, which are CORS-open, and all 37 entries resolve to archive.org.

Anyone regenerating the catalog must re-apply this preference or the app breaks with opaque
network failures. The catalog generator must **reject any URL that fails a CORS preflight** rather
than trusting the source site's choice of host.

### Bitrate note

This recording is roughly 3× the size of the reciter's older mp3quran mushaf (surah 6: 110 MB vs
55 MB). That is the main evidence it is genuinely a different, higher-quality recording — and the
reason storage dominates this design.

## Architecture

### Catalog

`data/catalog.json` — generated, committed, and bundled with the app:

```json
{ "reciter": "...", "mushaf": "...", "released": 37, "total": 114,
  "surahs": [ { "surah": 1, "name": "الفاتحة", "url": "https://archive.org/download/.../1.mp3", "bytes": 0 } ] }
```

The app bundles this file and **also attempts a refresh from a remote copy at launch**, falling
back silently to the bundled version when offline. Publishing newly released surahs is then a
matter of regenerating and redeploying the manifest — no app update, no code change.

Runtime scraping of the source sites is deliberately rejected: they are CORS-blocked, one returned
`406` to a plain request, and their markup is inconsistent. Scraping belongs in an offline
generator script, not in the app.

### Source abstraction

Nothing downstream knows where audio came from.

```ts
interface AudioSource {
  id: string
  name: string
  fetchSurah(n: number, onProgress: (loaded: number, total: number) => void): Promise<Blob>
}
```

- **`CatalogSource`** — chunked ranged fetch from the manifest URL.
- **`ImportSource`** — files chosen from the device.

Both write to the same store. Player, queue, resume, and lock-screen integration are
source-agnostic. This is what makes the incomplete mushaf a non-problem: a future release is a
manifest update, and anything obtained otherwise is an import.

**Import matching:** parse `001.mp3`, `1.mp3`, `01 - Al-Fatiha.mp3`, and Arabic surah names to a
surah number, with manual assignment for anything unmatched. Never silently dropped or misfiled.

### Storage — the dominant constraint

| Data | Store | Size |
|---|---|---|
| Audio blobs | IndexedDB, key `(sourceId, surahNumber)` | up to 1.79 GB now, ~4.5 GB eventually |
| Quran text | bundled JSON | 2 MB |
| Progress, download state, bookmarks | IndexedDB | negligible |

At 1.79 GB today and ~4.5 GB at completion, **bulk download is not the primary model.** Revised
from the earlier draft:

- **Per-surah download is the default and the promoted action.**
- **"Download all" is demoted** to a secondary action, enabled only when
  `quota - usage > catalogBytes × 1.25`, Wi-Fi-gated, with the real figure shown.
- Al-Baqarah alone is 218 MB — the UI must show per-surah sizes before download, because on a
  phone that is a meaningful choice, not a detail.
- Storage screen shows usage against quota and supports per-surah deletion, so the app stays
  usable on a full device.

Request `navigator.storage.persist()` on first run; read `navigator.storage.estimate()` before any
download.

**Eviction is a normal condition.** iOS will drop data under pressure, and at these sizes it is
likely. On play, if a blob is missing, say so plainly and offer one-tap re-download.

### Downloads

Chunked HTTP Range, 2 MB chunks, fixed concurrency of 3, pausable and resumable.

At 218 MB for a single surah this is **load-bearing, not an optimization** — a single-shot fetch
that large on mobile will routinely fail. A broken chunk costs at most 2 MB of refetching.
Completed files are verified against expected byte length before being marked done; partial state
survives an app close.

### Playback

- Single `<audio>` element fed blob object URLs
- **Media Session API** — lock-screen artwork, surah title, reciter, prev/next/seek
- **Continuous play** — auto-advance on `ended`, skipping unreleased surahs
- **Repeat** — off / repeat-one (memorization) / repeat-all
- **Sleep timer**
- **Resume** — `{surah, currentTime}` persisted on throttled `timeupdate` (~5s), on pause, and on
  `visibilitychange`; restored at launch

### Text view

Uthmani text for the current surah, bundled offline. **Static only** — the catalog serves
whole-surah audio, so ayah-level highlight sync is impossible without a per-ayah source. Out of
scope.

## Screens

1. **Surah list** — 114 rows; released ones show size and download state, unreleased show "not yet released"
2. **Player** — full-screen controls, seek, repeat, sleep timer
3. **Text** — Arabic text for the current surah
4. **Storage** — usage vs quota, per-surah delete, import files, download all

## Error handling

| Condition | Behavior |
|---|---|
| Network failure mid-download | Mark partial, resume from last good byte |
| `QuotaExceededError` | Explain, show usage, prompt to delete surahs |
| Blob evicted by OS | Detect on play, offer one-tap re-download |
| Incomplete/corrupt file | Byte-length check before marking complete; refetch on mismatch |
| Manifest refresh fails | Silently use bundled catalog |
| Host unreachable | Downloaded surahs still play; only new downloads blocked |
| Unmatched import | Manual surah assignment, never silent |

## Testing

**Unit** — import filename matcher, download resume logic, queue/repeat state machine, catalog
merge and availability logic.

**Integration** — fake IndexedDB; mocked fetch with real range semantics including mid-stream
failure; quota-exceeded simulation.

**Catalog generator** — must assert 114 entries or fewer, no duplicate surah numbers, and every
URL CORS-reachable.

**Manual device checklist:**
- Playback in airplane mode
- Lock-screen controls on Android and iOS
- Audio continuity when backgrounded
- Data survival across an iOS reboot
- A 218 MB download interrupted mid-way and resumed

## Out of scope for v1

Accounts, sync, translations, multiple reciters, ayah-level sync, Play Store submission,
YouTube ingestion, fallback to the older mp3quran recording.
