# Play Console listing

Everything to paste into the Console, and the answers to the questionnaires.
Written from what the code actually does — the Data Safety section in
particular is checkable against `index.html`'s Content-Security-Policy, whose
connect-src and media-src name every host the app may reach.

---

## App details

| Field | Value |
| --- | --- |
| App name (30 max) | `Al-Mau'iza — الموعظة` (21) |
| Default language | Arabic (ar) — the app's own default, matching the manifest |
| App or game | App |
| Free or paid | **Free — and not a choice. See below.** |
| Category | Books & Reference |
| Tags | Islam, Quran, Audio |
| Contact email | yousha.ahmed55@gmail.com |
| Website | https://notyousha.github.io/mushaf/ |
| Privacy policy | https://notyousha.github.io/mushaf/privacy.html |

### Free is a licence condition, not a pricing decision

The app bundles six translations obtained from the Tanzil Project, whose terms
are explicit: *"The translations provided at this page are for non-commercial
purposes only. If used otherwise, you need to obtain necessary permission from
the translator or the publisher."*

So while those translations ship, **Al-Mau'iza must not be sold, must not carry
in-app purchases or ads, and must not be bundled into anything sold.** Setting
this listing to paid would breach the licence on its content, not merely change
its price. Saheeh International in particular is not public domain — it is
carried under Tanzil's terms, © Al-Muntada al-Islami.

If it ever needs to change, the route is to license the translations directly
rather than to change this field: NOTICES.md names Furqaan Institute of Quranic
Education as the holder to approach for The Clear Quran, and they do grant free
app licences. Until somebody has done that and written it down, Free is the
only lawful setting.

## Short description (80 max)

English (76):

```
Complete murattal recitations, the printed mushaf, and offline listening.
```

Arabic (72):

```
مصاحف مرتلة كاملة، مع المصحف المطبوع، وتعمل دون اتصال بالإنترنت.
```

## Full description (4000 max)

English:

```
Al-Mau'iza is a Quran listening app built around complete murattal mushafs and
reading along with them.

RECITERS
16 complete mushafs, and the Taraweeh and Tahajjud archives of the two
Holy Mosques going back to 1414 AH. Among them: Yasser Al-Dosari, Abdurrahman
As-Sudais, Maher Al-Muaiqly, Bandar Baleela, Muhammad Al-Luhaidan, Mishary
Rashid Al-Afasy, Badr Al-Turki, Abdullah Al-Bu'ayjan and Muhammad Burhaji,
alongside a mushaf in the riwayah of Ad-Duri from Abu Amr al-Basri.

Every surah is checked before it is listed. A file whose length disagrees with
the text it claims to hold is not shown, because a recitation playing under the
wrong surah name is worse than a gap.

LISTEN OFFLINE
Download a single surah, a selection, or a whole mushaf, and it plays with no
signal. Downloads are stored on your own device — nothing is uploaded, and
there is no account. A Downloads screen shows what is saved, how much room it
takes, and lets you remove one surah, several, or an entire reciter.

Downloads resume where they stopped, and are verified against the source so a
resumed file can never splice two different recordings together.

THE PRINTED PAGE
Follow the recitation on the mushaf page as it is printed, with the word being
recited marked where word timings exist. For a reciter reading a riwayah other
than Hafs, the page is hidden rather than shown disagreeing with the voice.

MEMORISATION
Keep a wird, mark the places you stumble, and see which pages need review.
Nothing is assessed or scored: the app cannot hear you and does not pretend to.

TARAWEEH BY THE NIGHT
For the years the Haram and the Prophet's Mosque publish changeover times, the
app knows which imam is reciting at any moment and can step to the next voice —
measured against the audio itself, not guessed from a chapter list.

FIVE LANGUAGES
Arabic, English, Urdu, Hindi and French, each with its own script and numerals,
and full right-to-left layout.

NO ACCOUNTS, NO ADS, NO TRACKING
No sign-in, no advertising, no analytics, and no third-party SDKs of any kind.
The only requests the app makes are for the recitation audio itself, mostly
straight from the Internet Archive — and that is enforced by a
Content-Security-Policy rather than merely promised.

Recitations are produced by the Saudi Center for Quranic Recitations, the King
Fahd Glorious Qur'an Printing Complex, and the Presidency of the Two Holy
Mosques, and are credited in the app on each reciter's entry.

Note on storage: downloaded recitations are held by the browser engine for this
app. They do not appear under the app in Android's Settings, and clearing this
app's site data removes them.
```

Arabic: to be translated from the above before release. The app is fully
localised into Arabic already (`src/i18n/ar.ts`), so a listing that is not is
the odd one out.

---

## Data Safety

**Does your app collect or share any of the required user data types?** — **No.**

Justification, if review asks:

- Every store is device-local: IndexedDB (`prefs`, `audio`, `downloads`,
  `chunks`, `stumbles`, `pages`) and two localStorage keys for theme and
  language. Nothing is transmitted.
- There is no account system, no analytics, no advertising, no crash reporting
  and no third-party SDK. Runtime dependencies are React, React-DOM and `idb`.
- The only external requests are for the recitation audio itself: mostly
  `archive.org`, plus `download.quranicaudio.com` and `server8.mp3quran.net`,
  and — for the few reciters whose links must be looked up or that expire —
  `mushaf-audio.mushaftarteel.workers.dev`, a proxy operated by the developer.
  Each carries the device IP as any HTTP request must, and nothing else: no
  identifier, no cookie.
- This is enforced by the CSP in `index.html`, whose `connect-src` and
  `media-src` name exactly those hosts; `object-src 'none'`.

Tick, in the optional security section:

- **Data is encrypted in transit** — yes (HTTPS throughout).
- **You provide a way for users to request that their data is deleted** — yes;
  the Downloads screen deletes audio, and uninstalling or clearing site data
  removes everything.

**Permissions:** the app requests none. A TWA needs only `INTERNET`.

---

## Content rating (IARC questionnaire)

Category: **Reference, News, or Educational**. Expected outcome: Everyone / 3+.

| Question | Answer |
| --- | --- |
| Violence, blood, sexual content, profanity, drugs, gambling | None |
| Simulated gambling or real-money gambling | No |
| User-generated content or user-to-user communication | **No** — nothing is shared or published; there are no comments, profiles or messaging |
| Shares user location | No |
| Allows purchase of digital goods | No |
| Contains ads | **No** |
| Links to external websites | **Yes** — Settings links to the Wikimedia Commons page and the Creative Commons deed for the photograph used on the home screen, and they open in a browser |
| Targets children / designed for families | **No** — declare it is not, which keeps the Families policy out of scope |
| News app | No |

---

## Store assets

| Asset | Status |
| --- | --- |
| App icon 512×512, 32-bit PNG | `store/icon-512.png` |
| Feature graphic 1024×500 | `store/feature-graphic.png` |
| Phone screenshots (2–8, 16:9 or 9:16) | `store/screenshots/phone-*.png` |
| 7" and 10" tablet screenshots | Only needed if you declare tablet support. Skip for the first release. |

---

## Before the first production release

1. **Closed testing is mandatory for a new personal developer account** — 12
   testers who stay opted in for 14 continuous days, before you can apply for
   production access. Start this early; it is the longest pole.
2. **Digital Asset Links.** `public/.well-known/assetlinks.json` in the
   `notyousha.github.io` repo must carry the **App Signing** SHA-256 from Play
   Console → Setup → App integrity, not only the upload key's. Play re-signs
   every build, so an assetlinks file with just the upload fingerprint produces
   a TWA that shows a browser address bar in production. Put both in.
3. **Back up the upload keystore** somewhere that is not this repository and
   not only this machine. A lost upload key needs a Play-side reset.
4. **Settle the two UNRESOLVED entries in NOTICES.md before production, not
   before testing.** Internal and closed testing are private; production is
   public distribution and a different question.
   - The **604 printed page images** are the larger one, and as of 2026-08-27
     their provenance is unprovable: the source PDF has been deleted and the
     rendered pages carry no publisher mark. Either name the publisher, or
     replace them with Ad-Duri as text plus the Douri font, or remove them and
     let that reciter fall back to the page-hidden behaviour the app already
     has. NOTICES.md has the detail and the replacement route.
   - The **25 imam photographs** have no recorded source or licence, and they
     also appear in the store screenshots, which is more exposed than in-app.
5. **Confirm Cloudflare Workers log retention** (`worker/wrangler.toml` sets no
   `[observability]` block, and recent compatibility dates default it on). The
   privacy policy says what is logged; make it true.
