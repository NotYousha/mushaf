# Notices and attribution

What this app ships that is not its own, who it belongs to, and under what
terms. Kept as a file rather than only in the app so that it can be reviewed
without running anything, and so an unresolved item is visible instead of
absent.

Two entries below are marked **UNRESOLVED**. They are the ones to settle before
a store release: an asset whose licence cannot be stated is a takedown waiting
for somebody to ask, and for a Quran app the person asking is likely to be its
publisher.

---

## Quran text

**Tanzil** — the Uthmani text in `data/quran-text.json`.

Recorded in `scripts/build-forks.mjs`: *"Tanzil's Uthmani text renders waqf /
pause signs…"*. The Tanzil project asks to be named, and asks that the text not
be altered. The app does not alter it.

- Source: <https://tanzil.net/>
- **Action:** confirm which Tanzil edition and add its exact attribution line
  and terms here.

## Printed page layout

**Quran.com API v4**, whose word data carries the glyph codes of the **King Fahd
Glorious Qur'an Printing Complex** mushaf.

Fetched by `scripts/build-mushaf-layout.mjs` into `data/mushaf-layout.json`
(2.6 MB), which is what lets the app know which words fall on which of the 604
pages.

- Source: <https://api.quran.com/api/v4>
- **Action:** record Quran.com's terms of use, and whether the KFGQPC glyph
  codes carry conditions of their own.

## Printed mushaf page images — **UNRESOLVED**

`public/duri/001.webp` … `604.webp` — 604 rasterised pages, about 76 MB.

`scripts/build-duri-pages.py` renders them with PyMuPDF from a local file:

```
~/Downloads/quran-douri-mushaf_260822_162138.pdf
```

Nothing in this repository records who published that PDF, which edition it is,
or on what terms it may be redistributed. That is 604 pages of a specific
printed edition being served from the app.

- **Action, before release:** identify the publisher and the terms. If they
  cannot be established, remove these images and let the mushaf view fall back
  to text, rather than ship them. This is the single largest rights exposure in
  the repository.

## Reciter and imam photographs — **UNRESOLVED**

`public/imam-*.webp`, `public/afasy.webp`, `public/turki*.webp`,
`public/juhany.webp`, `public/luhaidan.webp`, `public/sheikh.jpg` — 25
photographs of identifiable living people.

`scripts/crop-imam-photos.py` reads them from a local folder
(`C:/Users/yoush/imam-photos`) and contains no source URLs. No photographer,
publication or licence is recorded for any of them.

The app's own code already states the correct standard, in `src/db/faces.ts`:
it declines to *"bundle pictures of people we have no rights to"*. These
predate that and do not meet it.

- **Action, before release:** for each portrait, either record source +
  photographer + licence (Wikimedia Commons has usable images of several of
  these imams), or remove it. `refresh-catalog.mjs` already establishes the
  fallback — a reciter shows a name and a blank ring rather than a face that
  might be somebody else's or somebody else's photograph.

## The home screen photograph

**Quran-Mus'haf Al Tajweed** — `public/quran-page.webp`.

Amr Fayez (TheEgyptian), via Wikimedia Commons, **CC BY 2.5**. Credited in the
app itself, in Settings, with links to the source file and the licence deed;
the credit text is in `public/quran-page.credit.txt`.

This one is done correctly and is the pattern the entries above should follow.

## Fonts

All five are under the **SIL Open Font License 1.1**, whose section 2 requires
the licence and copyright notices to travel with the files. Self-hosting is
redistribution, so they must ship — see `public/fonts/OFL.txt`.

Downloaded and subset by `scripts/build-fonts.mjs`:

| Family | Used for |
| --- | --- |
| Amiri | Arabic body text |
| Amiri Quran | the Quranic text itself |
| Aref Ruqaa | display and the wordmark's companion |
| IBM Plex Sans Arabic | interface |
| Noto Nastaliq Urdu | Urdu |

- **Action:** add each family's own copyright line to `public/fonts/OFL.txt`
  (Amiri © Khaled Hosny, and so on) — the licence text alone is not the whole
  of section 2.

## Recitations

Audio is **not** bundled, with one exception noted below. It is streamed on
demand through the app's proxy from the archive that publishes it, and cached
on the listener's own device only if they choose to download it.

Producers named in the app, on each reciter's entry:

- **Saudi Center for Quranic Recitations** (المركز السعودي للتلاوات القرآنية) —
  Al-Dosari, As-Sudais, Al-Bu'ayjan, Badr Al-Turki, Abdulaziz Al-Turki.
- **King Fahd Glorious Qur'an Printing Complex** — Al-Muaiqly, Al-Luhaidan.
  Al-Luhaidan's files carry an explicit `TCOP` copyright tag naming the
  Complex; `scripts/refresh-catalog.mjs` records this.
- **The Presidency of the Two Holy Mosques**, for the Taraweeh archives.

Hosts the proxy fetches from: archive.org, quranicaudio.com, mp3quran.net,
tilawatalharamain.com, abdullahjuhany.com, midad.com, and the Saudi Center's
own site.

Attribution is not a licence, and this section is a statement of what the app
credits rather than a claim of permission. If a rights holder objects to their
recording being proxied, the fix is to drop that reciter's entry — each is one
block in `scripts/refresh-catalog.mjs` and one route in `worker/src/index.js`.

- `public/audio/burhaji-097.mp3` is the one recitation bundled in the app
  rather than streamed. It supplies al-Qadr for the Prophet's Mosque mushaf,
  which the source collection does not contain. **Action:** record its
  provenance, or serve it the same way as everything else.

## Software

Runtime dependencies are React, React-DOM and `idb`, all MIT. Build
dependencies are listed in `package.json`.

The app's own source has no licence file yet — see the repository root.
