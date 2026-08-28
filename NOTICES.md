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

### The terms, now read — 2026-08-28

The lead that earlier sessions called "promising but unverified" has been
verified, and it holds. The Complex's usage-rights page was retrieved at three
separate Wayback snapshots — 2022-01-10, 2022-05-18 and 2023-04-01 — and the
wording is byte-identical in all three. Under **حقوق الاستخدام**, granted on
the named authority of the Minister of Islamic Affairs, the digital copy of the
Madinah Mushaf may be used **مجاناً** (free of charge) in personal and
individual work, the work of government bodies and private and civil
institutions, paper printing, desktop and media publishing, **مواقع الإنترنت
والبرامج الحاسوبية** — websites and computer software — **داخل المملكة العربية
السعودية وخارجها**, inside the Kingdom and outside it. The single carve-out is
the printing of physical masahif inside the Kingdom, or importing them, for
commercial sale. Nothing in it restricts software.

- <https://dm.qurancomplex.gov.sa/copyright/>
- <https://dm.qurancomplex.gov.sa/douridownload/> — and there **is** an
  official Ad-Duri release: 460.43 MB, md5 `5557B758056EDD3304A4EDFE8ED7087B`,
  sha1 `F37C19E7E6E5070596AAE0B0B8E9DF234BF9492E`.

Two things follow, and together they change what this entry is.

**The grant names one format, and the Ad-Duri release is in it.** The
usage-rights page lists `رسم المتجهات Illustrator` — vector — and the Ad-Duri
edition is published as exactly that, `بصيغة ai للمتجهات`. This is inside the
grant's own wording rather than by analogy to it, which makes it firmer ground
than the Unicode-text route described below, whose dataset lives on a separate
developer portal the grant does not enumerate.

**Provenance becomes checksummable.** The Complex publishes the hashes of its
own file, so "where did this mushaf come from" stops being something anyone has
to take on trust.

The images we ship are still **not** that file: `build-duri-pages.py` records a
~76 MB PDF, not a 460 MB `.ai`, and the filename was a download-site timestamp.
They are almost certainly a third party's conversion of the Complex's work —
same vector drawing with no text layer, same 604 pages, same pagination. The
Complex's terms would cover the underlying work; it is the chain of custody
that cannot be shown, and re-fetching the publisher's own file makes the chain
irrelevant.

**Action, before production — an afternoon, not a research problem.** From a
network that can reach `qurancomplex.gov.sa` (every host refuses connections
from this one): download the Ad-Duri digital copy, check `sha1sum` against the
value above and stop if it differs, re-run `scripts/build-duri-pages.py`, and
diff the output against the current pages — page 50 must open at Aal-Imran 3:1
and page 604 must be the last three surahs. Render the cover page too, kept out
of `public/duri/`: the script skips it as "the cover", and it is the one page
that would have named the publisher. **And keep the source file this time.**
The whole of this entry exists because the last one was thrown away.

There is also an email worth sending, which turns an archived page into a
current permission — `info@qurancomplex.gov.sa`, asking them to confirm that a
free non-commercial app is inside the grant, how they would prefer to be
credited, and whether the same permission covers the Unicode text and the
Douri font.

**Decision, 2026-08-27, unchanged: kept for internal and closed testing, to be
settled before production.** Those tracks are private, so the exposure there is
negligible, and the alternative is putting a lesser app in front of the twelve
testers whose feedback unlocks production.

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
`public/juhany.webp`, `public/luhaidan.webp`, `public/sheikh.jpg`,
`public/ali-jaber.webp`, `public/ghilan.webp`, `public/minshawi.webp`,
`public/ossi.webp` — **32** photographs of identifiable living people. (This
entry said 25 until 2026-08-28; `public/` holds 34 `.webp`/`.jpg` files, of
which only `logo-mark.webp` and the correctly-licensed `quran-page.webp` are
not portraits.)

`scripts/crop-imam-photos.py` reads them from a local folder
(`C:/Users/yoush/imam-photos`) and contains no source URLs. No photographer,
publication or licence is recorded for any of them.

The app's own code already states the correct standard, in `src/db/faces.ts`:
it declines to *"bundle pictures of people we have no rights to"*. These
predate that and do not meet it.

Six of them are on the home screen and therefore in the Play store
screenshots, each captioned with the man's name and, for several, his official
title. That is the most exposed placement any of these assets has: store
listing artwork is what a human reviewer actually looks at, and name plus
official title plus unlicensed portrait is the shape Play's Impersonation
policy describes. Research on 2026-08-28 found usable CC-licensed or
public-domain portraits on Wikimedia Commons for four of the thirty-two —
As-Sudais, Al-Muaiqly, Al-Afasy and Shuraim — and nothing usable for the rest.

**Decision, 2026-08-28: ship them as they are.** The alternatives were put and
declined: removing all thirty-two and falling back to a name and a blank ring,
or sourcing the four licensed portraits and blanking the other twenty-eight.
This entry stays as the record of what is and is not known, so that the choice
is a choice rather than an oversight, and so that whoever revisits it does not
have to establish the position again.

If it is revisited, the work is small. `src/db/faces.ts` already states the
standard — it declines to *"bundle pictures of people we have no rights to"* —
and `refresh-catalog.mjs` already implements the fallback: a reciter shows a
name and a blank ring rather than a face that might be somebody else's, or
somebody else's photograph. Deleting the files is the whole of the change.

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
