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

Arabic:

```
"الموعظة" تطبيق للاستماع إلى القرآن الكريم، مبنيّ على المصاحف المرتّلة الكاملة
وعلى متابعة التلاوة في المصحف.

القُرَّاء
ستة عشر مصحفًا مرتّلًا كاملًا، مع أرشيف التراويح والتهجّد من الحرمين الشريفين
منذ عام ١٤١٤هـ. من بينهم: ياسر الدوسري، وعبد الرحمن السديس، وماهر المعيقلي،
وبندر بليلة، ومحمد اللحيدان، ومشاري راشد العفاسي، وبدر التركي، وعبد الله
البعيجان، ومحمد برهجي، إضافةً إلى مصحف برواية الدوري عن أبي عمرو البصري.

كل سورة تُفحَص قبل إدراجها. والملف الذي لا تتفق مدّته مع النص الذي يُنسب إليه
لا يُعرض، لأن تلاوةً تعمل تحت اسم سورة أخرى أسوأ من غيابها.

الاستماع دون اتصال
نزّل سورة واحدة، أو مجموعة منها، أو مصحفًا كاملًا، ثم استمع إليه بلا شبكة.
التنزيلات محفوظة على جهازك وحده — لا يُرفع منها شيء، ولا حساب في التطبيق أصلًا.
وشاشة "التنزيلات" تُظهر ما هو محفوظ، وكم يشغل من مساحة، وتتيح حذف سورة واحدة،
أو عدة سور، أو قارئ بأكمله.

والتنزيل يستأنف من حيث توقف، ويُطابَق بالمصدر، فلا يمكن لملف مستأنَف أن يجمع
بين تسجيلين مختلفين.

الصفحة المطبوعة
تابع التلاوة على صفحة المصحف كما طُبعت، مع تعليم الكلمة المتلوّة حيث توجد
توقيتات للكلمات. وللقارئ الذي يقرأ برواية غير حفص تُخفى الصفحة بدلًا من
عرضها مخالِفةً للصوت.

الحفظ
اجعل لك وِردًا، وعلِّم المواضع التي تتعثّر فيها، واعرف الصفحات التي تحتاج
مراجعة. ولا شيء هنا يُقيَّم أو يُعطى درجة: التطبيق لا يسمعك ولا يدّعي ذلك.

التراويح ليلةً ليلة
في السنوات التي يُنشَر فيها وقت تبادل الأئمة في المسجد الحرام والمسجد النبوي،
يعرف التطبيق مَن يتلو في كل لحظة، ويستطيع الانتقال إلى الصوت التالي — مقيسًا
على التسجيل نفسه، لا مُستنتَجًا من قائمة.

خمس لغات
العربية والإنجليزية والأردية والهندية والفرنسية، لكلٍّ رسمها وأرقامها، مع
تخطيط كامل من اليمين إلى اليسار.

بلا حسابات ولا إعلانات ولا تتبُّع
لا تسجيل دخول، ولا إعلانات، ولا تحليلات، ولا أي حزمة تطوير خارجية. والطلبات
الوحيدة التي يرسلها التطبيق هي طلب التلاوة نفسها، من أرشيف الإنترنت في
الغالب — وهذا مفروضٌ بسياسة أمان المحتوى (CSP) لا موعودٌ به فحسب.

التلاوات من إنتاج المركز السعودي للتلاوات القرآنية، ومجمع الملك فهد لطباعة
المصحف الشريف، والرئاسة العامة لشؤون المسجد الحرام والمسجد النبوي، وهي منسوبة
إليها داخل التطبيق عند كل قارئ.

ملاحظة عن التخزين: التلاوات المنزَّلة يحفظها محرك المتصفح لهذا التطبيق. ولا
تظهر تحت التطبيق في إعدادات أندرويد، ومسح بيانات موقع هذا التطبيق يحذفها.
```

Written against the same source as the English above, not machine-translated
from it — the two say the same things in the same order, and the Arabic is the
one the store will show by default, since `ar` is the listing's default
language and the manifest's `lang`.

---

## Data Safety

**Does your app collect or share any of the required user data types?** — **No.**

Justification, if review asks:

- Every store is device-local: IndexedDB (`prefs`, `audio`, `downloads`,
  `chunks`, `stumbles`, `pages`, `faces`), four localStorage keys — theme,
  light/dark mode, language, and a rolling on-device log of the media commands
  the lock screen sends, kept so a playback fault can be described — and one
  sessionStorage flag for the splash screen. Nothing is transmitted.
  (`faces` holds portraits added from the device. No screen in this build
  opens the picker: `FacePanel` has no import site. The store is described
  anyway, because it exists and a reviewer reading the schema will see it.)
- There is no account system, no analytics, no advertising, no crash reporting
  and no third-party SDK. Runtime dependencies are React, React-DOM and `idb`.
- The only external requests are for the recitation audio itself: mostly
  `archive.org` — which redirects to storage nodes under `*.archive.org`, both
  named in the CSP — plus `download.quranicaudio.com` and `server8.mp3quran.net`,
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

**Permissions:** the app requests none at all — verified against the built
artefact, not assumed. `aapt2 dump badging` on `app-release.apk` lists one
`uses-permission`, and it is the framework's own
`…DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, which Android generates for every
app targeting SDK 33+. **There is not even `INTERNET`**, because a Trusted Web
Activity does no networking itself: it hands the URL to Chrome, and Chrome's
process makes the requests. An earlier draft of this file said "a TWA needs
only INTERNET"; that was wrong, and the true answer is the better one to give
a reviewer.

### The other declarations the Console will not let you skip

Data Safety and the content rating are the two that get written about, but a
release is blocked until all of these are answered too. Every answer here is
derivable from the code; the only reason they are listed is that an unanswered
one stops a rollout at the last step.

| Declaration | Answer | Why |
| --- | --- | --- |
| Advertising ID | **No** | No ad SDK, no `advertisingId`, no ads. |
| App access | **All functionality available without restrictions** | There is no login and nothing gated. Say so explicitly; leaving it blank makes a reviewer ask for test credentials that do not exist. |
| Target audience and content | **13+ and up only** | Do **not** tick an under-13 band. Doing so pulls in the Families policy and the Designed-for-Families requirements, neither of which this app is built for — and nothing in the code needs them. |
| Designed for families | **No** | Follows from the row above. |
| Government app | **No** | |
| Financial features | **None** | No payments, no billing, no crypto, no donation link. |
| Health apps | **No** | |
| Data encrypted in transit | **Yes** | HTTPS throughout; the CSP names no `http:` origin. |
| Data deletion route provided | **Yes** | The Downloads screen deletes audio; clearing site data or uninstalling removes everything. |
| News app | **No** | |

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
| App icon 512×512, 32-bit PNG | `store/icon-512.png` — 512×512 RGBA. Ready. |
| Feature graphic 1024×500 | `store/feature-graphic.png` — 1024×500 RGB. Ready. |
| Phone screenshots (2–8, 16:9 or 9:16) | `store/screenshots/phone-1..6-*.png` — six, 1080×1920, regenerated 2026-08-28 from the current build. |
| 7" and 10" tablet screenshots | Only needed if you declare tablet support. Skip for the first release. |

The screenshots were re-shot rather than reused. The old set showed a **Mushaf
tab and a Hifz tab**, both of which this build holds back (`READING_TABS` is
`false` in `src/App.tsx`), so the listing would have advertised two screens the
app does not have — a misdescription, and the first thing a tester would have
written in. `scripts/make-screenshots.py` now walks the three first-run
questions before it starts shooting, and photographs the Translation tab in
place of the Mushaf one.

Re-shoot with the preview server running:

```
npm run build
npx vite preview --port 5178 --strictPort    # one terminal
python scripts/make-screenshots.py           # another
```

---

## The Android build

The keystore, the SDK and the AAB all exist. See `store/ANDROID.md` for how,
and for the two things about the Windows toolchain that are not obvious.

| | |
| --- | --- |
| Bundle to upload | `../mushaf-android/app/build/outputs/bundle/release/app-release.aab` |
| APK for installing on your own phone | `../mushaf-android/app/build/outputs/apk/release/app-release.apk` |
| Upload key SHA-256 | `38:39:CC:32:BA:49:8D:62:14:14:A4:65:83:69:3F:F5:DD:CF:79:B3:00:9F:E3:3D:9F:26:ED:EF:5B:CD:EA:A6` |
| versionCode / versionName | `26082701` / `1.0.0` |
| targetSdk / minSdk | 36 / 21 |

---

## Before the first production release

1. **Closed testing is mandatory for a new personal developer account** — 12
   testers who stay opted in for 14 continuous days, before you can apply for
   production access. Start this early; it is the longest pole, and everything
   else here can be done while it runs.
2. **Back up the upload keystore.** `../mushaf-android/android.keystore` and
   the password in `../mushaf-android/keystore.properties`. Neither is in any
   repository, and neither should be — but "not in a repository" and "on one
   laptop" are not the same thing. A lost upload key needs a Play-side reset.
3. **Digital Asset Links.** `https://notyousha.github.io/.well-known/assetlinks.json`
   returns 404 today, and until it does not, every tester sees a Chrome address
   bar pinned over the mushaf. It cannot be finished before the first upload,
   because the fingerprint that matters is the **App Signing** SHA-256 that
   Play generates when it re-signs — Console → Setup → App integrity. Put both
   that and the upload fingerprint above into
   `store/assetlinks.template.json` and publish it. Do it on upload day.
4. **The 604 printed page images.** No longer unprovable — see NOTICES.md. The
   King Fahd Complex's own usage-rights page permits free use of its digital
   masahif in "websites and computer software", inside the Kingdom and outside
   it, and it publishes the Ad-Duri edition in exactly the format that grant
   names, with an md5 and SHA1 to check it against. What remains is an
   afternoon: download the Complex's file from a network that can reach
   `qurancomplex.gov.sa`, verify the hash, re-render, and keep the source this
   time. Do it before production, not before testing.
5. **The imam photographs.** 32 portraits of identifiable living people with no
   recorded source, photographer or licence, six of them on the home screen and
   in the store screenshots, captioned with each man's name and title. The
   decision on 2026-08-28 was to ship them as they are. NOTICES.md keeps the
   record of what is and is not known about them, and `src/db/faces.ts` already
   implements the fallback — a name and a blank ring — if that decision is ever
   revisited.
6. **Cloudflare Workers logging** — settled by disclosure rather than by
   configuration. `worker/wrangler.toml` sets no `[observability]` block and
   recent compatibility dates default it on, so `public/privacy.html` now says
   plainly that the proxy's host keeps ordinary request logs including the
   connecting IP, and for how long and to what end. The document and the
   deployment agree; either could have been changed to make that so, and the
   honest one was cheaper.
