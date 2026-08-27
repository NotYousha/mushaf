# Al-Mau'iza — the reading half of the app

2026-08-27

Until now this has been a listening app that happens to show a page. The five
things asked for here turn it into a reading app that happens to play audio.
They are not five separate features; four of the five need the same two things
underneath — a way to name a *place* in the mushaf, and a way to name an
*edition* of it.

## What is already true

- `data/mushaf-layout.json` is the 604-page, 15-line Madani Uthmani layout.
  Every word is `[text, "surah:ayah:word"]`. It has been checked against the
  canonical juz table: all thirty juz start on the pages the printed mushaf
  starts them on, and 4:173 lands on page 105. The data is sound.
- `data/quran-text.json` is the same text as running ayahs.
- `MushafView` renders the layout as live HTML with the Amiri Quran webfont,
  fits the type so the widest line just fits, and highlights the word being
  recited — for the one reciter that has word timings.
- `PagedMushaf` renders a 604-image mushaf one page at a time, for Ad-Duri.
  The image-per-page pattern already works.
- Audio, downloads, IndexedDB, the reciter roster and the Taraweeh
  compilations all exist and are not touched by this work.

## The two things missing underneath

### 1. Divisions — naming a place

A new `src/mushaf/divisions.ts`, built from a generated `data/divisions.json`:

- juz 1–30, hizb 1–60, rub' 1–240: each a start `surah:ayah` and a start page
- the page each surah begins on
- lookups: `juzOfPage`, `hizbOfPage`, `surahOfPage`, `pagesOfJuz`

The juz table is verified against the layout rather than trusted. The hizb and
rub' tables are generated the same way and checked the same way.

This is what lets the full-screen page say `Juz' 1 … Al-Baqarah … 3`, what
lets the surah list group under juz headings, and what fills the translation
view's `Page 105 | Juz 6 | Hizb 11` pill.

### 2. Editions — naming a script

A new `src/mushaf/editions.ts`, a registry of mushaf editions:

```ts
type Edition = {
  id: string
  family: 'uthmani' | 'tajweed' | 'indopak'
  name: string; description: string
  badge?: 'large-screen' | 'experimental'
  /** Live Unicode text — word highlighting, search and a screen reader work. */
  render: { kind: 'text'; layout: string; font: string }
       /** Page images — none of the above, but the right script. */
       | { kind: 'images'; base: string; pages: number }
  /** IndoPak calls the unit Para, not Juz. */
  unitWord: 'juz' | 'para'
}
```

The distinction that matters is `text` versus `images`. A text edition can be
followed word by word, searched, and read aloud by a screen reader. An image
edition can do none of those, and the picker says so rather than letting the
reader discover it. Which editions actually ship is decided by what can be
verified and legally redistributed, not by what the reference app lists.

## The five features

### 1. Full-screen mushaf

The complaint is exact: the page is small and the brand chrome is on top of
it. Both are the same cause — the mushaf renders inside the shared sheet, so
it pays for a header carrying the logo and wordmark, a dock, and a card
border, and `fitPage` then sizes fifteen lines into what is left.

Immersive mode: the header and dock come off, the card frame comes off, and
the page gets the viewport. `fitPage`'s height budget goes from
`viewport - 190` to `viewport - 96`, which is most of the size increase on its
own. In their place, drawn on the page itself as a printed mushaf does it:

- top left, the juz — `Juz' 1`, or `Para 1` on an IndoPak edition
- top right, the surah — `Al-Baqarah البقرة`
- bottom centre, the page number

Tapping the middle of the page brings the controls back. Swiping turns pages.
The chrome is a tap away, never two.

### 2. Choose Mushaf

A picker screen: three segmented tabs — Uthmani, Tajweed, IndoPak — and a card
per edition with a badge, a name, a description and a thumbnail of the script,
the selected one ticked. Reached from the mushaf's own chrome and from
settings. The chosen edition is a preference, and every reading surface reads
it.

### 3. Juz and Para navigation

The surah list gains a segmented control — **Surahs | Juz'** — and, in the
Surahs view, juz headings with the surahs that begin under them, each row
carrying its start page. Collapsible, because thirty headings over a hundred
and fourteen rows is a longer list than the one it replaces.

The Juz' view lists the thirty, each opening into its two hizbs and eight
rub' quarters, each of which jumps to a page.

On an IndoPak edition every one of these reads **Para**.

### 4. Translation

A reading view that is not the printed page: a verse chip (`4:173`), the
Arabic, and the translation under it. A header pill naming where you are —
`An-Nisa · Page 105 | Juz 6 | Hizb 11`. Per-verse overflow: play from here,
copy, bookmark.

Translations are fetched per surah and cached in IndexedDB, never bundled — a
translation is about 800 KB and there will be several. The choice of
translations is constrained by what may actually be redistributed, which is
being verified rather than assumed.

### 5. Following the recitation

This is the one that cannot be promised uniformly, and the codebase already
has a strong opinion about claiming coverage it does not have — `hasTimings`
exists because listing a reciter with an empty timing file broke three
features at once on the reciter the app opens with.

So: granularity, honestly reported.

```ts
timingGranularity(reciterId, surah): 'word' | 'ayah' | null
```

- **word** — published word segments exist for this reciter. The mushaf
  highlights the word, as it does today for Burhaji.
- **ayah** — only verse boundaries are known. The mushaf highlights the whole
  ayah. This is the reference screenshot's fallback too: it shades the ayah
  and boxes the word.
- **null** — nothing is known. Nothing is highlighted and nothing is claimed.

For the Haramain Taraweeh compilations there is no published data of either
kind, and there will not be: they are one MP3 per surah per year, recorded in
the mosque. Verse-level forced alignment is the only route, it runs offline,
and coverage grows rather than arriving complete — the same shape as the
existing Al-Dosari alignment. The app must be correct while coverage is
partial, which is what the granularity function is for.

## Order

1. Divisions data and module — nothing else can be built without it.
2. Full-screen mushaf. Self-contained, and it is the complaint that was listed
   first.
3. Juz and Para navigation.
4. Editions registry and the Choose Mushaf picker.
5. Translation view.
6. Timing granularity, and whatever timing data can actually be sourced.

Each phase ships built, tested and committed before the next begins.
