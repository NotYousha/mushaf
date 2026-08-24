# Haram 1447 Taraweeh — a multi-voice compilation in the catalog

**Date:** 2026-08-24
**Status:** designed, blocked on two external inputs

Adds the recitation of the Taraweeh and Tahajjud prayers at the Grand Mosque for
1447 AH — published by شؤون الأئمة والمؤذنين — to the catalog as a fifth entry.

It is the first entry that is not one sheikh's mushaf. Taraweeh at the Haram rotates
imams across the month, so a 114-surah run assembled from it carries six to eight
voices. Nearly all of the work below follows from that one fact.

## Blocked on

**Where the audio is hosted.** YouTube cannot be the source, and this is a plumbing
constraint rather than a policy one: `fetchRange` pulls 2 MB at a time and validates a
resume with `If-Range` (`src/download/chunked.ts:56`), which needs a stable URL, `206`
support and a validator. YouTube offers none of the three, and re-hosting the
Presidency's own production would be both a licensing problem and a bandwidth bill.

The material is published as MP3s elsewhere. Requirements on whatever host is chosen:

1. **`Range` support at origin.** The Worker passes `Range` through and does not
   buffer. No `206` means no seeking and no resumable download.
2. **An ETag or `Last-Modified`.** Sharper than it looks: without a validator
   `fetchRange` omits `If-Range`, so the `status === 200 && from > 0` branch at
   `chunked.ts:118` never fires and a resumed download splices two different
   recordings into one surah with no warning. A host with no validator must be
   shipped stream-only, with download disabled for the entry.
3. **CORS is irrelevant.** Defeating a missing `Access-Control-Allow-Origin` is the
   proxy's entire purpose. Do not rule out a candidate for it.

**Which imam recited which surah.** 114 rows of attribution that cannot be inferred or
invented. It comes from the channel's video titles or the host's own labelling.

## Fetch path

A `/h/{1-114}.mp3` route on the existing `mushaf-audio` Worker, beside `/b/ /d/ /t/
/j/`. Resolve on demand, cache the resolution, stream back with CORS attached and
`Range` passed through. No new bindings; the Cache API remains sufficient and the
Worker stays on the free plan.

The resolver body takes one of two shapes depending on the host:

- **Path pattern** (`…/taraweeh1447/001.mp3`) — a URL builder, no index fetch.
- **Collection page** (one page per surah holding a `<source>` tag) — another entry in
  the existing `HARAMAIN` map, which already handles this shape for three sources.

Ramadan 1447 is over, so the surah list does not grow. The entry uses `fixedCount: 114`
as `burhaji-nabawi` does: no `/count/` endpoint, no index TTL, and nothing for the
weekly `refresh.yml` job to poll.

## Catalog shape

Two optional fields on `CatalogEntry` (`src/catalog/types.ts`):

```ts
/** Who recites this surah, when the entry is a compilation rather than
 *  one sheikh's mushaf. Absent means the reciter's own voice. */
voice?: string
voiceEn?: string
```

Optional, so the four existing reciters need no migration. `buildView` carries them onto
`SurahView` alongside `bytes` and `verified`.

`CatalogEntry.name` is removed in the same pass. `refresh-catalog.mjs:349` writes it,
`load.ts:20` overwrites it from `surahs.json`, and nothing in `src/` or `tests/` reads
it — `matchFilename` reads `name`/`nameEn` off `SurahMeta`, not off a catalog entry. A
dead `name` sitting beside a live `voice` invites being repurposed by mistake.

Attribution data lives in two hand-authored files:

- `data/imams.json` — `imamId → { name, nameEn }`, so a name is written once rather
  than 114 times and the file serves future years.
- `data/voices-haram-1447.json` — `surah → imamId`.

The ids exist only in those two source files. `refresh-catalog.mjs` resolves them and
writes the **display names** into `voice`/`voiceEn`, so the app never performs a join
and `imams.json` is not shipped to the client. An unresolvable id fails the refresh
rather than writing a blank attribution.

Hand-authored rather than scraped from page titles: a scrape is less work until a title
is formatted differently, and wrong attribution on a recitation is the failure
`matchFilename`'s own comment calls the worst this app can have.

## Verification

The plausibility check (`scripts/refresh-catalog.mjs:286-307`) takes the median
seconds-per-letter across an entire entry and deletes any surah outside 0.69–1.45× it.
That is correct for one voice and wrong for a compilation: a deliberate reciter's surahs
and a quicker one's sit on opposite sides of a shared median, and the gates delete
legitimate recordings. Taraweeh audio also contains takbir and rak'ah transitions, which
inflate duration unevenly.

The check is stratified rather than loosened:

```
group measured surahs by voice
for each group where n >= 8:
    median of that group's seconds-per-letter
    judge its members at the existing 0.69 / 1.45 gates
for each group where n < 8:
    no judgment; keep, verified: false
```

The gates do not move. A genuine mislabel still stands out against its own imam's pace,
which is what the check exists for — it is what caught the four Burhaji files holding
each other's recitations. Widening the band to absorb pace differences would have missed
those, since they were off by roughly that margin.

`verified` becomes `judged && withinGates`. Unjudged surahs ship `verified: false`,
routing them to the existing `VerifyPanel`, where `effectiveVerified()` already lets a
listener's ear override the catalog in both directions.

The grouping logic moves to `scripts/lib/judge.mjs` as
`judgeByVoice(measured, voiceOf, lettersIn)` — a pure function with no I/O — because
inline logic in an `.mjs` script cannot be tested.

## App surface

`haram-1447` joins the pre-cropped medallion rule at `theme.css:864`
(`--face-zoom: 100%`, `50%/50%`). Requires a square `public/haram.webp`, supplied by
the user.

Attribution surfaces in three places:

| Where | Now | With a compilation |
|---|---|---|
| `SurahList.tsx:86` | `{s.nameEn} · {s.translation}` | trailing muted `{s.voiceEn}` when present |
| `App.tsx:1104-1105` | `reciter.fullName` / `nameEn` | the current surah's voice — the entry title says nothing about who is being heard |
| `App.tsx:341,693,1303` | `reciter.fullName` as MediaSession artist | `s.voice ?? reciter.fullName` |

The third row matters most: it is the lock screen and the native shell's bottom
accessory, so a wrong artist there is the most visible way this change can fail.

One new i18n key for the attribution label, across all five language files.

## Needs no work

Most of the app absorbs this entry without changes, which is worth recording so the
implementation does not go looking for work that is not there:

- **Timings and talqeen** stand down on their own. `ayahStartsFor('haram-1447', …)`
  returns null and the `noTimings` string already explains why.
- **Mushaf pages display normally.** Haram Taraweeh is Hafs, so no `riwayah` is set and
  `isHafs()` is true. The page pairing is correct here in a way it is not for
  Al-Juhany.
- **Downloads, import, verdicts, forks and HifzBoard** are keyed `reciterId:surah` or
  are independent of reciter. The entry coexists with the existing four automatically,
  and `purgeSuspectAudio`'s 2026-08-18 cutoff cannot reach anything saved after it.

## Testing

- `judge.test.ts` — a fast imam and a slow imam in one entry both survive where a
  single median would delete them; a 2× outlier within one imam's group is still
  caught; a group of six goes unjudged rather than mis-judged.
- `data.test.ts` — every entry carrying `voice` also carries `voiceEn`; every
  `haram-1447` surah has both; every id in `voices-haram-1447.json` resolves against
  `imams.json`, and no catalog `voice` is blank.
- MediaSession artist falls back to `reciter.fullName` when `voice` is absent, proving
  the existing four entries are unchanged.

## Rejected

- **One reciter per sheikh.** Fits the current model with no code changes, but adds six
  to eight rows of incomplete mushafs to the picker, and a surah led by two imams has
  nowhere to live.
- **One entry, no attribution.** Pure catalog data, no new fields — but for Haram
  Taraweeh, who is reciting is usually the first thing a listener wants to know.
- **Skipping the length check entirely.** Honest, and `VerifyPanel` would carry it, but
  nothing would catch a mislabelled file until someone happened to listen.
