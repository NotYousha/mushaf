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

## Printed mushaf page images — **UNRESOLVED, and now unprovable**

`public/duri/001.webp` … `604.webp` — 604 rasterised pages, about 76 MB. They
exist for one reason: Al-Juhany reads Ad-Duri, whose wording differs from the
Hafs text the app bundles, so his mushaf cannot be shown as text.

`scripts/build-duri-pages.py` rendered them with PyMuPDF from
`~/Downloads/quran-douri-mushaf_260822_162138.pdf`.

**Provenance can no longer be established from what remains.** Three things
were checked, on 2026-08-27:

- The source PDF is **gone** from that path. It cannot be inspected, and its
  metadata — where a publisher would name itself — is unrecoverable.
- The rendered pages carry **no publisher mark**: no frame, no colophon, no
  footer. Page 604 is the last three surahs on white and nothing else. The
  script skipped PDF page 0, described in its own comment as the cover, which
  is the one page that would have said.
- The filename is a timestamp (`260822_162138`), the shape of a download from
  some site rather than a publisher's release.

There is a **promising but unverified** lead. If the PDF was a King Fahd
Complex publication, the Complex's own terms appear to permit free use in
computer programs, inside and outside Saudi Arabia, restricting only
commercial-sale printing of masahif.

**Nobody has read the live terms.** That wording
came from a Wayback snapshot recovered by a research subagent and relayed
between sessions; `dm.qurancomplex.gov.sa` and `qurancomplex.gov.sa` refuse
connections from this network, and `web.archive.org` is unreachable from the
tooling here. Treat it as a snapshot until somebody on a network that can reach
the host reads it. And it would only matter if the PDF were theirs, which is
exactly what cannot now be shown.

**Decision, 2026-08-27: kept for internal and closed testing, to be settled
before production.** Those tracks are private, so the exposure there is
negligible, and the alternative is putting a lesser app in front of the twelve
testers whose feedback unlocks production. Production is public distribution
and a different question.

### The route that would end this rather than document it

Serve Ad-Duri as **text plus a font**, not as pictures. The Complex's download
portal lists an Ad-Duri font (`Douri`) beside Hafs and Warsh. If Ad-Duri can be
sourced as Unicode text and set in it, `public/duri/` and its 76 MB go away,
the rights question goes with them, and Ad-Duri gains word following, search
and screen-reader support that page images can never have.

Two things to know before trying, both narrower than they first look.

**The deliverable is one file, not a mushaf.** Everything downstream of the
layout is already riwayah-agnostic: `MushafView` renders any
`{pages: [{n, w: [[text, key]]}]}`, and `src/mushaf/divisions.ts`, the juz
index, the veil and the fit measurement all key off `surah:ayah:word`. So what
is missing is a page layout for Ad-Duri in that shape — which words fall on
which of the 604 pages — plus a font that renders it. `data/mushaf-layout.json`
is Hafs and cannot be reused. Nothing else changes.

**Do not vendor the font.** KFGQPC's faces are all rights reserved and must not
be modified — verified by parsing `QCF_P001.TTF`, which carries no licence or
licence-URL name record, only a reservation. Two separate hazards follow, and
the second is the one that is easy to miss:

- `scripts/build-fonts.mjs` **subsets**, which is modification. It must not be
  pointed at one.
- `globPatterns` in `vite.config.ts` includes `**/*.woff2`, so a face dropped
  into `public/fonts/` is **precached into every installed service worker** —
  confirmed against the built `sw.js`, which carries 18 of them. That is
  redistribution twice over, in the repository and on every device, and it
  cannot be walked back once installs exist. Hotlink it, or get written
  permission first.

**Action, before the production release:** either establish the PDF's publisher
and record it here, or take the text-and-font route, or remove the images and
let Al-Juhany fall back to the behaviour the app already has — the page view is
hidden for a non-Hafs riwayah, with a line saying why. Shipping 604 pages of an
edition nobody can name is the one option that should not survive to
production.
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

## Translations

Six translations are bundled, all obtained from the **Tanzil Project**
(<https://tanzil.net/trans/>), built by `scripts/build-translations.mjs` into
`public/trans/`.

- **Saheeh International** — English. © Al-Muntada al-Islami / Abul-Qasim
  Publishing House. Not public domain; carried under Tanzil's terms.
- **Talal Itani, *Clear Quran*** — English. Freely licensed by the translator.
- **Fatah Muhammad Jalandhari** — Urdu.
- **Suhel Farooq Khan and Saifur Rahman Nadwi** — Hindi.
- **Muhammad Hamidullah** — French.
- **Tafsir al-Muyassar** — Arabic. King Fahd Glorious Qur'an Printing Complex.
  A short tafsir rather than a translation, and the interface says so.

Tanzil's terms: *"The translations provided at this page are for
non-commercial purposes only. If used otherwise, you need to obtain necessary
permission from the translator or the publisher."* They further require a link
back where more than three of their translations are used, which this is:
<https://tanzil.net/trans/>.

**Al-Mau'iza must not be sold, or bundled into anything sold, while these
translations are in it.** That is a licence condition, not a preference.

Deliberately absent: **Dr. Mustafa Khattab's *The Clear Quran***, the
translation most often asked for. Furqaan Institute of Quranic Education holds
an exclusive licence to publish and distribute it; quran.com has withdrawn it
from their public API and the Quranic Universal Library carries it as the only
resource on that site with its download removed. Copies are easy to find and
none of them is a licence. **Action:** if it is wanted, ask Furqaan Institute
(<https://theclearquran.org/copyright-information>) — they do grant free app
licences, and Quran for Android carries an explicit one. Until then, Talal
Itani's translation of the same name is offered instead.

## Tajweed colouring

`public/tajweed.json` marks where each tajweed rule falls inside each word,
built by `scripts/build-tajweed.py` from **quran.com's** `uthmani_tajweed`
text (<https://api.quran.com/api/v4/quran/verses/uthmani_tajweed>), which is
open and key-less. The colour scheme follows the Dar al-Marefa convention.

No tajweed mushaf is reproduced. The rules are projected onto the app's own
text by character alignment — quran.com's markup sits on Tanzil's spelling and
our page comes from the King Fahd Complex's, and the two differ in about sixty
systematic ways. Anchor accuracy is checked at build time and the script
refuses to write below 99.5%.

The alternative, which was rejected, was the KFGQPC V4 colour font or a scan
of the Dar al-Marefa edition. Both would have replaced our page with something
that cannot be searched, cannot be followed word by word, and cannot be read
aloud by a screen reader.

## Mushaf editions not shipped, and why

Recorded so nobody re-derives it. See `src/mushaf/editions.ts`.

- **Hafs, Medina 1421 AH** and **Madani Mushaf 1441** — obtainable. Both are
  604 per-page glyph fonts on `static.qurancdn.com`, which serves them with
  open CORS. The King Fahd Complex's own usage terms permit free use in
  computer programs and websites; the fonts themselves are all-rights-reserved
  and **may not be modified**, so no subsetting. Not built yet.
- **Hafs, Medina 1440 AH** and **Madani Mushaf 1439** — no public source of
  any kind. Absent from quran.com's mushaf registry, absent from the Quranic
  Universal Library's layouts.
- **IndoPak 15-line** — the text is free and complete (quran.com mushaf 6, 610
  pages). The blocker is the font: QuranWBW's AlQuran IndoPak is the only face
  that renders it, and its embedded licence reads *"NOT FOR SALE, NOT FOR
  MODIFICATION, NOT FOR DISTRIBUTION OR NOT FOR DEVELOPMENT WITHOUT WRITTEN
  NOTICE BY QURANWBW.COM"*. **Action:** email quranwbw@gmail.com. Note also
  that IndoPak paginates in 610 pages, so every page number in the app would
  have to become edition-scoped.

## Quran fonts

The Quran text is set in **Amiri** and **Amiri Quran**, both under the SIL
Open Font License.

Two faces from the **King Fahd Glorious Quran Printing Complex** were fetched,
shipped briefly and removed. Their provenance — source URL, byte count,
sha256 and the full licence text read out of each font's own name table — is
still in `data/fonts.json`, and `scripts/fetch-mushaf-fonts.mjs` will fetch
them again. Neither was ever subsetted: their licence permits use, copying and
distribution but forbids modification, and subsetting a font is modifying it.

- **KFGQPC HAFS Uthmanic Script** — the Complex's own Hafs face, and the one
  our page layout was printed in. It is heavier and brighter than Amiri Quran
  and it is *wrong for our text*: it expects the Complex's own encoding, not
  the Unicode Uthmani we render, and draws U+06DF — the small high rounded
  zero marking a silent letter — as a large filled circle on the baseline
  instead of a small mark above the line. That character is in ءَامَنُوا۟,
  كَفَرُوا۟, أُو۟لُوا۟ and hundreds more. Using it again means adopting the
  QPC text as well, which is a different layout rather than a different
  stylesheet.
- **KFGQPC Nastaleeq** — fetched for the IndoPak edition, and removed with it.

## Quran division metadata

Juz, hizb and rub' al-hizb boundaries in `data/divisions.json` are derived
from quran.com API v4 verse metadata and cross-checked against the printed
Madani mushaf and against `data/mushaf-layout.json`. Tanzil publishes the same
tables under **CC BY 3.0** and was used to verify them.

## Software

Runtime dependencies are React, React-DOM and `idb`, all MIT. Build
dependencies are listed in `package.json`.

The app's own source has no licence file yet — see the repository root.
