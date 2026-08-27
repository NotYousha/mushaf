# Mushaf roadmap

## The bet

The app's one real advantage is **word-level audio alignment on a real mushaf
page**. Quran.com has had word-sync requests open since 2018 and still hasn't
shipped it, because it is a data problem rather than a code problem. Three
features are only possible on top of that primitive, and none of them shows up
in a feature-comparison table. Build on the moat, not alongside it.

---

## Phase 0 — Fix what's broken — **done**

| What | State |
|---|---|
| Resumable downloads | Done. Chunks commit as they arrive; resume validates with `If-Range`. |
| Car & lock-screen metadata | Done. Arabic title, artwork, honest scrubber, ayah stepping. |
| Low-bitrate audio tier | **Dropped.** See "Opus transcode" below. |

### Opus transcode — considered and dropped

Would cut a full reciter from ~2.4 GB to ~600 MB. Rejected because it needs
~6 GB transcoded and ~1.5 GB re-hosted under our own account, costs audible
quality on recitation, and raises an attribution question about re-publishing
someone else's recording. Streaming-first plus selective, resumable download
already solves the size problem the transcode was for: the app itself is
892 KB, and the GB figures are opt-in.

---

## Phase 1 — More synced voices — **blocked on data, not code**

Only Barhaji is synced today, which limits every feature below to one voice.

**What was checked (2026-08-22):**

- QUL (`qul.tarteel.ai`) publishes **41 surah-by-surah recitations with
  segments** — Husary, Minshawi, Abdul Basit, Alafasy, Sudais, Shuraim, Maher
  al-Muaiqly, and two "Yasser ad-Dussary" sets. Downloads need a free account;
  unauthenticated requests to
  `/resources/recitation/{id}/download?format=json` return 401.
- **The public Al-Dosari data is a different recording from ours.** Measured
  with `scripts/probe-duration.mjs`:

  | Surah | Ours (new Saudi Center mushaf) | Public `yasser_ad-dussary` |
  |---|---|---|
  | 1 | 61.1 s | 48.0 s |
  | 112 | 24.1 s | 11.4 s |

  Timings are recording-specific, so these cannot transfer. No public data
  exists for Al-Turki at all.
- `api.quran.com` serves segments free and without auth, but they are offsets
  **within per-ayah files**, and the surah files are not clean concatenations
  of them — summed ayah segments fall short of the surah duration by an amount
  that scales with ayah count. They do not convert reliably.

**So Phase 1 has two honest routes:**

1. **Add a reciter that ships with matching timings** (free QUL account).
   Cheap, and immediately gives every feature below a second voice.
2. **Align our own recordings** with a forced aligner. Correct for the
   reciters we actually have, but needs ~6 GB fetched, an aligner toolchain,
   and hours of compute per reciter, with uncertain quality on the long madd
   of Quranic recitation.

Neither blocks Phases 2–4, which all work on Barhaji today — a complete,
verified 114-surah set.

---

## Phase 2 — The practice primitives — **done**

**Talqeen Mode** — shipped. The reciter reads a line, then goes silent *for exactly as
long as that line took*, so you recite it back, then continues. This is how
every halaqa on earth teaches. Muallim recordings exist for one reciter at one
fixed chunk size; we can generate it for any reciter and any chunk, because we
have the timings. This is the feature that makes someone tell a friend, and it
works with the screen off.

**The Veil** — shipped. Progressive removal of the text on the real page: full → faded →
first word of each line → blank, with the page geometry preserved, because
position on the page *is* part of what a hafiz memorises. Press and hold to
peek; every peek is silently recorded.

**Stumble marks** — shipped. Two-finger tap means "I stumbled here." That is the whole
input. It replaces AI recitation-checking, which is the single most-complained-
about feature of the funded competitor, and which would break the no-server
promise.

---

## Phase 3 — The memorisation system — **done**

**Sabaq board** — shipped. The three tiers real students use: sabaq (new), sabqi
(recent), manzil (everything older, on rotation). Pages, not percentages. **The
app never sets your curriculum** — your teacher does; the app remembers and
schedules. That restraint is what makes teachers tolerate an app.

**Wird engine** — shipped. One dial: finish in 7 days (the seven manazil), 30 days (a juz
a night), or Ramadan. Reading and listening share one position.

**Mushaf heat map** — shipped. All 604 pages on one screen, shaded by how well you hold
them. Navigation surface and gut-punch in one.

---

## Phase 4 — The Fork Drill — **done**

The most common hifz error is taking the wrong branch: a phrase appears twice,
and your mouth continues into the wrong surah. Every existing tool shows this
as a text diff in two columns. But the mistake does not happen on the page. It
happens in the mouth, at speed, in prayer, in the dark.

So: play the reciter up to the exact word where the two passages diverge,
**cut**, and wait. You supply the next word. Then it plays the correct
continuation — and immediately the other branch, so you hear both futures of
the same past.

That needs word-accurate alignment, a repetition index, and a page renderer
that can address single words. We have all three.

---

## Deliberately not building

**Streaks, points, badges.** The documented failure mode in hifz is comparing
your pace to others. Show *debt* — pages owed — never a flame.

**AI recitation checking.** The cloud version breaks the privacy promise;
on-device breaks the size promise; and a false "you made a mistake" on correct
recitation is uniquely corrosive here.

**Accounts and cloud sync.** Most-requested feature on Quran.com since 2013,
and still wrong for us. Export/import of a single file solves the real need —
"I got a new phone" — with no server, no privacy policy, and no bill.

**Prayer times, qibla, athan.** This is precisely the bloat people cite when
leaving the big all-in-one apps. Stay a mushaf.

---

## Where it stands (2026-08-22)

Everything above is built and deployed except more synced voices, which
is Phase 1 and is a data problem rather than a code one.

The repetition index behind the Fork Drill holds **1335 shared phrases**
of four words or more that diverge — generated from the Uthmani text by
`scripts/build-forks.mjs`, so it can be regenerated rather than trusted.

**The one thing still gating the practice features:** Talqeen Mode, the
Veil's usefulness, and the Fork Drill all need word-level timings, and
only Barhaji has them. Each says so plainly rather than appearing
broken. Adding a fourth reciter from QUL's 41 segmented sets would give
all three a second voice; see Phase 1 above for what that takes.

Initial download is 921 KB. Layout, timings and the fork index are lazy
chunks kept out of the precache.

---

## A second riwayah — Al-Juhany in Ad-Duri (2026-08-22)

Every other reciter here reads **Hafs from Asim**, and so does everything
built on top: the bundled Quran text, the 15-line page layout, the word
timings, and the fork index.

**Abdullah Al-Juhany** reads **Ad-Duri from Abu Amr al-Basri**. That is not a
different voice saying the same words — it is different wording. So:

- A reciter may now declare a `riwayah`, and it is shown in brackets beside
  their name everywhere the name appears. Absent means Hafs.
- The Hafs mushaf page refuses to render under a non-Hafs reciter, and that
  riwayah's own printed pages are shown instead.

### Why there is no word highlighting for it

The only source for the Ad-Duri text is a PDF whose glyphs are **vector
drawings** — `get_text()` returns nothing, `get_fonts()` returns nothing, and
a page is 18 path objects and 770 KB of content stream. There is no text
layer to extract and nothing to address a single word by.

Even with perfect OCR it would not be enough: highlighting also needs
word-level audio timings for *this* recording, and none are published.

So the pages are rendered as images — 604 of them at 850px, grayscale WebP,
79 MB total and 128 KB each, fetched one at a time and kept by the service
worker once opened. The reader gets the correct text on the page it is
actually being recited from, and manual page turning.

### The audio

`abdullahjuhany.com` has the same shape as `tilawatalharamain.com` — a
collection page listing one `/quran/{id}` per surah, each with a single
`<source>` — so one Worker resolver serves all three collections now.

Its files sit on `top4top.io`, which sends no CORS header and is unreachable
from some networks entirely. It also drops connections under any concurrency:
a first pass over 114 surahs saw a third come back 522 from the proxy, which
is why the catalog refresh retries and can be told to run serially
(`REFRESH_CONCURRENCY=1 REFRESH_ATTEMPTS=7`). Those 522s were a flaky host,
not missing recordings, and must not be mistaken for holes in the catalog.

**That is no longer the whole story (2026-08-27).** Thirty-one of the 114 now
522 *deterministically*. Probed three times over a minute, surahs 1, 6, 9, 10
and 13 returned 522 on every attempt while surah 2 returned 206 each time — so
these are not the host flapping, and no number of retries will collect them.
The list endpoint still reports 114 published, meaning the pages exist and the
audio behind thirty-one of them does not.

There is nowhere else to get it. mp3quran lists exactly one Al-Juhany mushaf
and it is Hafs from Asim — the one this app already carries as `juhany-hafs`.
No other host publishes his Ad-Duri. So the entry stands at 83, and the
remaining thirty-one are blocked on `top4top.io`, not on this app.

Five *other* reciters do have a complete Ad-Duri from Abu Amr on mp3quran —
Al-Husary among them — but that is a different mushaf by a different man, and
substituting it would be passing one reciter's recitation off as another's.
