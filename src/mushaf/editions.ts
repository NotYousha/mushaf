/**
 * The mushafs a reader can choose between.
 *
 * The distinction that runs through this file is not Uthmani against IndoPak.
 * It is **live text against pictures of text**, and it decides what the app
 * can still do once an edition is chosen:
 *
 * - live text keeps word-by-word highlighting, tap-to-seek, the Veil, search,
 *   and the ayah-by-ayah copy a screen reader reads;
 * - a page image keeps none of them.
 *
 * Every mainstream Quran app that offers "different mushafs" offers scans, and
 * pays that price silently. This app pays it nowhere: every edition listed
 * here is live text, and the picker says what each one is rather than leaving
 * the reader to discover that the page has gone quiet.
 *
 * That constraint is also why two of the reference app's cards are missing —
 * see UNAVAILABLE at the foot of this file, which records why, so the next
 * person does not spend the same afternoon finding out.
 */

export type EditionFamily = 'uthmani' | 'tajweed' | 'indopak'

export type Edition = {
  /** Stored as a preference, so it never changes once shipped. */
  id: string
  family: EditionFamily
  name: string
  nameAr: string
  description: string
  descriptionAr: string
  /**
   * Shown as a pill on the card, as the reference UI does.
   *
   * `experimental` is a promise that it may be wrong; nothing carries it
   * unless it might be.
   */
  badge?: 'experimental'
  /**
   * How the page is drawn.
   *
   * `text` is Unicode with one span per word. `glyphs` would be a per-page
   * font in the private use area — still one span per word, so highlighting
   * survives, but unsearchable and unreadable aloud. Nothing ships as
   * `glyphs` yet; the type exists so the picker can already say so.
   */
  kind: 'text' | 'glyphs'
  /**
   * Colour the letters by tajweed rule, from public/tajweed.json.
   *
   * Not a separate text — the same page, with the rules drawn on. That is
   * what lets the Tajweed tab exist at all without giving up everything
   * above.
   */
  tajweed?: boolean
  /** Juz, or Para. Both name the same thirtieth. */
  unitWord: 'juz' | 'para'
  /** Pages, where an edition does not paginate as the Madani mushaf does. */
  pages: number
}

export const EDITIONS: Edition[] = [
  {
    id: 'madani-1405',
    family: 'uthmani',
    name: 'Hafs, classic Medina, 1405 AH',
    nameAr: 'حفص، مصحف المدينة، ١٤٠٥ هـ',
    description:
      'The classic Hafs mushaf issued in Madinah in 1405 Hijri, from the King ' +
      'Fahd Glorious Quran Printing Complex. Fifteen lines to the page, set in ' +
      'Amiri Quran — so every word can be followed, tapped and read aloud.',
    descriptionAr:
      'مصحف حفص الصادر في المدينة عام ١٤٠٥ هـ عن مجمع الملك فهد لطباعة المصحف ' +
      'الشريف. خمسة عشر سطرًا في الصفحة.',
    kind: 'text',
    unitWord: 'juz',
    pages: 604,
  },
  {
    id: 'madani-1405-tajweed',
    family: 'tajweed',
    name: 'Hafs, Tajweed',
    nameAr: 'حفص، مصحف التجويد',
    description:
      'The same 1405 page, with the tajweed rules coloured on it — ghunnah, ' +
      'ikhfa, qalqalah, the madds and the rest. Because the colour is drawn ' +
      'onto live text rather than replacing it with a picture, following the ' +
      'recitation word by word still works.',
    descriptionAr:
      'الصفحة نفسها مع تلوين أحكام التجويد: الغنة والإخفاء والقلقلة والمدود. ' +
      'النص حيّ لا صورة، فتتبع التلاوة كلمة بكلمة يبقى كما هو.',
    kind: 'text',
    tajweed: true,
    unitWord: 'juz',
    pages: 604,
  },
]

export const DEFAULT_EDITION = 'madani-1405'

export const editionById = (id: string): Edition =>
  EDITIONS.find((e) => e.id === id) ?? EDITIONS[0]

export const editionsIn = (family: EditionFamily): Edition[] =>
  EDITIONS.filter((e) => e.family === family)

/**
 * The tabs, in the order the picker shows them.
 *
 * IndoPak is listed even though nothing ships in it yet. A tab that appears
 * only once it has contents is a tab nobody knows to look for, and the empty
 * state is where the reader is told what is actually holding it up.
 */
export const FAMILIES: EditionFamily[] = ['uthmani', 'tajweed', 'indopak']

/**
 * UNAVAILABLE, and why — so nobody spends the afternoon again.
 *
 * **Hafs, Medina 1440 AH** and **Madani Mushaf 1439** appear in other apps and
 * have no public source of any kind. They are absent from quran.com's mushaf
 * registry, which lists only V1 (1405), V2 (1421) and V4 (1441); absent from
 * the Quranic Universal Library's twelve layouts; and `files.quran.app` 404s
 * on both. Whatever those apps ship, they did not get it from anywhere
 * public.
 *
 * **Hafs, Medina 1421 AH** and **Madani Mushaf 1441** are obtainable and are
 * worth doing. Both are per-page glyph fonts — 604 fonts, 93 MB and 40 MB
 * respectively, hotlinked from static.qurancdn.com, which serves them with
 * open CORS. Each needs its own page layout built from quran.com's mushaf 1,
 * and 1441 needs its line breaks scraped from QUL because quran.com returns
 * V2's for it. The cost is a build script and a per-page @font-face loader;
 * the cost to the reader is that those editions cannot be searched or read
 * aloud, because every glyph is a private-use codepoint.
 *
 * **IndoPak 15-line** is the one people will ask for, the data is free, and
 * the font is the blocker. quran.com's mushaf 6 gives the whole layout as
 * ordinary Unicode — searchable, highlightable, everything. The only face
 * that renders it correctly is QuranWBW's AlQuran IndoPak, whose embedded
 * licence reads "NOT FOR SALE, NOT FOR MODIFICATION, NOT FOR DISTRIBUTION OR
 * NOT FOR DEVELOPMENT WITHOUT WRITTEN NOTICE BY QURANWBW.COM". The OFL
 * alternative does not cover the codepoints. **Someone has to email
 * quranwbw@gmail.com.** Until then the tab says so.
 *
 * And when IndoPak does land it brings a real integration cost, not just a
 * font: it paginates in **610** pages, not 604. Page 3 of an IndoPak mushaf
 * is 2:5–2:15 where page 3 of the Madani is 2:6–2:16. Every page number in
 * the app — the index, the hifz board, the translation view's header — is
 * currently a Madani page number, and all of them would have to become
 * edition-scoped.
 */
export const UNAVAILABLE: Record<
  EditionFamily,
  { name: string; reason: 'no-source' | 'needs-permission' | 'buildable' }[]
> = {
  uthmani: [
    { name: 'Hafs, Medina, 1421 AH', reason: 'buildable' },
    { name: 'Madani Mushaf (1441)', reason: 'buildable' },
    { name: 'Hafs, Medina, 1440 AH', reason: 'no-source' },
    { name: 'Madani Mushaf (1439)', reason: 'no-source' },
  ],
  tajweed: [],
  indopak: [{ name: 'IndoPak 15-Line', reason: 'needs-permission' }],
}
