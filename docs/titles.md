# `data/titles.json` — honorifics and offices

Two strings per person, in the app's five languages (`ar`, `en`, `ur`, `fr`, `hi`):

- **`short`** — the honorific prefix shown beside a name in a list. Only the
  honorific: `الشيخ د.` / `Sh. Dr.`, or `الشيخ` / `Sh.` Never the name.
- **`full`** — the office, one short clause, shown on one line under the name in
  the expanded player: `إمام وخطيب المسجد الحرام` / `Imam and Khatib of the
  Grand Mosque`. Never the name.

Keys are the same reciter/imam ids used by `data/catalog.json` (`reciters[].id`)
and `data/imams.json`. The three recitation-variant ids — `juhany-hafs`,
`buayjan-nabawi`, `burhaji-nabawi` — are the same men as `juhany`, `buayjan` and
`burhaji`, and carry identical titles so a lookup on either id works.

`source` is one URL that was actually read to establish the office. It is not
shown in the app; it is there so the next person can re-check.

## The rule: omit rather than guess

These are living scholars, and the app puts their names against recitations of
the Quran. **A wrong title is worse than no title.** Where an office could not be
established with confidence, the person is left out of this file entirely — the
app is expected to render a name with no honorific when the id is missing.

Two consequences worth keeping:

- **No invented doctorates.** `د.` / `Dr.` appears only where a source states the
  person holds one. Being called *Sheikh* is not evidence of a doctorate. Where
  sources disagreed about a doctorate, the entry drops to plain `الشيخ` — that
  is never wrong, whereas an unearned `د.` is.
- **No present tense for offices a person no longer holds.** Former imams are
  labelled *former*, and the two men in this file who have died carry a death
  year rather than a present-tense description.

## Where these came from

Ordered by the weight given to them:

1. **رئاسة الشؤون الدينية بالمسجد الحرام والمسجد النبوي** —
   <https://prh.gov.sa/ar/علماء-ومشائخ-الحرمين>. The employer. It publishes the
   current rosters of both mosques *with the exact honorific* for each man, which
   is why it is the source for every currently serving imam here. Note this body
   was created in August 2023, when the old الرئاسة العامة was restructured; the
   older `gph.gov.sa` is not the live authority any more.
2. **Arabic Wikipedia** — for the men not on a current roster (former imams, the
   deceased, and those attached to mosques outside the Haramain), and for
   doctorate evidence.
3. **English Wikipedia** — used only to corroborate dates already found in
   Arabic, notably the tenure end dates of Saud Ash-Shuraim, Khalid Al-Ghamdi and
   Salih Al Talib.

Arabic was written first and the other four translated from it. Urdu is natural
Urdu (the app renders it in nastaliq), not transliterated Arabic; Hindi is
Devanagari; French uses ordinary French sentence capitalisation.

## Known soft spots

- **`thubaiti`** — the Presidency roster styles him *الدكتور*, but the Arabic
  Wikipedia biography lists his degrees only up to a master's. Given the
  conflict he carries plain `الشيخ` here.
- **`burhaji`, `qarafi`** — their doctorates rest on the Presidency roster's
  *الدكتور* prefix rather than a biography naming the degree.
- **`humaid`** — labelled *former*, supported by his absence from the current
  roster plus a *سابقًا* on two Arabic Wikipedia pages, but no source gives the
  date he was relieved.
- **`kalbani`, `bauthman`, `bukhari`** — all three led Taraweeh at the Grand
  Mosque as guests for a named Ramadan rather than holding a standing imamate, so
  they are labelled *Taraweeh imam*, not *imam*. A bare "imam of the Grand
  Mosque" would overstate all three.
- **`altalib`** — appointed 2002, has not served since 2018. Recorded neutrally
  as a former imam and khatib; the circumstances are not the app's business.
- **`maghamsi`** — appointed to the Prophet's Mosque in February 2026, recent
  enough to be worth re-checking. He is on the current roster.

## Currently omitted

- **`turki-abdulaziz`** (عبد العزيز التركي) — no source found for this person at
  all: no Wikipedia article, no entry in the mp3quran or quranicaudio reciter
  databases. He may be a confusion with `turki` (بدر بن محمد التركي), imam of the
  Grand Mosque since October 2024. Left out until the identity is settled.
- **`sudais-ali`** (علي السديس) — brother of Abdurrahman As-Sudais. Everything
  findable traces back to one unreferenced Arabic Wikipedia stub saying he was
  formerly an imam of the Prophet's Mosque; no service years, no degree, and he
  appears in no roster or imam list. Not enough to put a title against a man's
  name, so he has none.

## Re-checking

Appointments change. When someone is added to `catalog.json` or `imams.json`, or
when an imam moves, start at the Presidency roster above: if a man is on it, take
his office and honorific verbatim from it; if he is not, he is not currently an
imam of either mosque, and needs a source of his own — or no entry.
