/**
 * Refreshes data/catalog.json from the audio proxy.
 *
 * Al-Dosari's mushaf is still being recorded — the Saudi Center airs episodes
 * nightly — so the surah list grows over time. This asks the Worker how many
 * are published, sizes each one through the same path the app uses, and
 * rewrites the catalog. Run weekly by .github/workflows/refresh.yml.
 *
 *   node scripts/refresh-catalog.mjs           # refresh everything
 *   node scripts/refresh-catalog.mjs dosari    # one reciter
 *
 * Exits 0 with no changes when nothing new has aired, so the job can decide
 * whether there is anything to commit.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const text = JSON.parse(readFileSync('data/quran-text.json', 'utf8'))

const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }

/** Letters of Quranic text in a surah — the best cheap proxy for how long it
 *  takes to recite, and far better than ayah count. */
const lettersIn = (surah) =>
  (text[String(surah)] || []).join(' ').replace(/[^ء-ي]/g, '').length

/**
 * Duration of an MP3, or null when it cannot be read confidently.
 *
 * Returning null matters more than returning a number: several sources serve
 * .m4a, which this cannot parse at all, and a garbage duration fed to the
 * plausibility check silently drops perfectly good surahs from the catalog.
 * Only a real MPEG frame header counts as a measurement.
 */
function durationOf(buf, total) {
  if (buf.length < 12) return null
  // ISO base media (.m4a/.mp4) begins with a size field then 'ftyp'. Its
  // payload contains byte pairs that look like MPEG sync, so scanning it as
  // MP3 yields a confident, wrong answer — one .m4a measured 8.58x its true
  // length and was nearly dropped from the catalog as corrupt.
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') return null
  let off = 0
  if (buf.slice(0, 3).toString('latin1') === 'ID3') {
    off = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f))
  }
  while (off < buf.length - 4 && !(buf[off] === 0xff && (buf[off + 1] & 0xe0) === 0xe0)) off++
  if (off >= buf.length - 4) return null
  const h1 = buf[off + 1], h2 = buf[off + 2], h3 = buf[off + 3]
  const ver = (h1 >> 3) & 3
  const layer = (h1 >> 1) & 3
  const brIdx = (h2 >> 4) & 0xf
  const srIdx = (h2 >> 2) & 3
  // Reserved version, non-Layer-III, free/bad bitrate or reserved sample rate
  // all mean this is not an MP3 frame we can trust.
  if (ver === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) return null
  const br = (ver === 3 ? BR1 : BR2)[brIdx] * 1000
  const sr = (SR[ver] || SR[3])[srIdx]
  const chan = (h3 >> 6) & 3
  const x = off + 4 + (ver === 3 ? (chan === 3 ? 17 : 32) : (chan === 3 ? 9 : 17))
  const tag = buf.slice(x, x + 4).toString('latin1')
  if (tag === 'Xing' || tag === 'Info') {
    const flags = buf.readUInt32BE(x + 4)
    if (flags & 1) return buf.readUInt32BE(x + 8) * (ver === 3 ? 1152 : 576) / sr
  }
  return br ? ((total - off) * 8) / br : 0
}

const WORKER = process.env.WORKER_URL ?? 'https://mushaf-audio.mushaftarteel.workers.dev'
const CONCURRENCY = Number(process.env.REFRESH_CONCURRENCY ?? 4)
const only = process.argv[2] ?? null

const meta = JSON.parse(readFileSync('data/surahs.json', 'utf8'))
const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'))

const SOURCES = {
  dosari: {
    home: true,
    route: 'd',
    name: 'ياسر الدوسري',
    nameEn: 'Yasser Al-Dosari',
    fullName: 'أ. د. ياسر بن راشد الدوسري',
    mushaf: 'إنتاج المركز السعودي للتلاوات القرآنية',
    photo: 'sheikh.jpg',
    note: 'ما زال قيد التسجيل — تُضاف السور الجديدة تلقائيًا.',
  },
  /**
   * Re-pointed at the Saudi Center's own publication of this mushaf.
   *
   * What this entry used to carry was his 1441 recording, reaching us as a
   * ~160 kbps transcode of the YouTube uploads on his own channel. This is a
   * different performance — ten to twenty per cent slower — encoded at
   * 256 kbps from the centre's masters, and it is the one the centre
   * publishes as his murattal.
   *
   * The reciter id is unchanged on purpose, so a saved position and a
   * favourite still point at the man they were meant to. Anyone who had
   * already downloaded surahs still holds the old recording for those; it
   * plays, and it is his, so this is not worth wiping a library over.
   */
  turki: {
    home: true,
    route: 't',
    name: 'بدر التركي',
    nameEn: 'Badr Al-Turki',
    fullName: 'الشيخ بدر التركي',
    mushaf: 'المصحف المرتل — إنتاج المركز السعودي للتلاوات القرآنية',
    mushafEn: 'Murattal mushaf — Saudi Center for Quranic Recitations',
    photo: 'turki.webp',
  },
  'burhaji-nabawi': {
    home: true,
    route: 'b',
    // complete; no need to ask
    fixedCount: 114,
    name: 'محمد برهجي',
    nameEn: 'Muhammad Burhaji',
    fullName: 'أ. د. محمد برهجي',
    mushaf: 'المصحف المرتل من مسجد رسول الله ﷺ',
    mushafEn: "The Prophet's Mosque",
    photo: 'imam-burhaji.webp',
    /**
     * The source's files in the 94-102 range hold each other's recitations.
     * Comparing our exact durations against the QUA reference timings for
     * this same recording identifies which file holds which surah, so most
     * are recoverable by pointing the surah at the file that actually
     * contains it rather than the one named after it.
     *
     * `surah: file`, verified by duration to within 1%.
     */
    remap: { 94: 96, 95: 97, 96: 98, 98: 100, 99: 94, 100: 101, 101: 102, 102: 95 },
    /**
     * Az-Zalzala and Al-Qaari'a run 51.4s and 51.2s here — two tenths of a
     * second apart, against trailing silence that varies by more than a
     * second. No measurement separates them, so these were identified by
     * listening, as was 100 when Al-Qaari'a was heard playing Al-Aadiyaat.
     */
    earConfirmed: [99, 100, 101, 97],
    /**
     * Al-Qadr is not in the source collection at all — the one unplaced file
     * matches surahs already being served better than it matches Al-Qadr. It
     * is supplied instead from a copy of the same recording, hosted with the
     * app. Measured at 36.70s against the reference 36.94s, at the same
     * 128 kbps as the rest of this mushaf.
     */
    localFiles: { 97: 'audio/burhaji-097.mp3' },
    exclude: [],
  },
  /**
   * The only reciter here who is not reading Hafs.
   *
   * Ad-Duri from Abu Amr al-Basri is a different riwayah, so the wording
   * itself differs from the Hafs text the rest of the app is built on. The
   * riwayah is therefore carried on the reciter and shown wherever the name
   * is, and the mushaf page refuses to display Hafs text under it.
   */
  juhany: {
    route: 'j',
    home: true,
    name: 'عبد الله الجهني',
    nameEn: 'Abdullah Al-Juhany',
    fullName: 'الشيخ عبد الله بن علي الجهني',
    riwayah: 'رواية الدوري عن أبي عمرو البصري',
    riwayahEn: 'Ad-Duri from Abu Amr al-Basri',
    // Its audio is spread over top4top subdomains, several of which are
    // currently down. Ship what plays; the weekly job collects the rest.
    partialOk: true,
    mushaf: 'مصحف برواية الدوري عن أبي عمرو البصري',
    mushafEn: 'Mushaf in the riwayah of Ad-Duri',
    // Two of his mushafs are here now, so the grid has to say which is which.
    tag: 'الدوري',
    tagEn: 'Ad-Duri',
    photo: 'juhany.webp',
    exclude: [],
  },
  /**
   * Al-Juhany's complete Hafs murattal, which the Ad-Duri entry above is not.
   *
   * That one is stuck at eighty-three of a hundred and fourteen and will stay
   * there while a third of its files sit on top4top subdomains that do not
   * answer — the recordings exist, the hosting does not. This is a different
   * mushaf of his: Hafs from Asim, all 114, on a host that serves ranges and
   * never expires a URL.
   *
   * It is a separate entry rather than a filler for the other's holes. The
   * riwayah alone settles that — Ad-Duri is different wording, so splicing
   * Hafs into it would put a recitation under the reader that disagrees with
   * the mushaf they chose.
   */
  'juhany-hafs': {
    route: 'jq',
    // complete; no need to ask
    fixedCount: 114,
    name: 'عبد الله الجهني',
    nameEn: 'Abdullah Al-Juhany',
    fullName: 'الشيخ عبد الله بن علي الجهني',
    mushaf: 'المصحف المرتل الكامل — برواية حفص عن عاصم',
    mushafEn: 'Complete murattal mushaf — Hafs from Asim',
    tag: 'حفص',
    tagEn: 'Hafs',
    photo: 'juhany.webp',
  },
  /**
   * As-Sudais, still being recorded, and missing al-A'raf.
   *
   * The gap is the source's, not ours: the centre has published surahs 1-6
   * and 8-21 and nothing yet for al-A'raf. Because the surah list is read by
   * name rather than by position, the hole stays a hole instead of shifting
   * everything after it by one.
   */
  sudais: {
    home: true,
    route: 'sd',
    // Spelled as data/imams.json spells him. He is also an imam in the
    // Taraweeh archive, and the same man must not read two ways.
    name: 'عبد الرحمن السديس',
    nameEn: 'Abdurrahman As-Sudais',
    fullName: 'أ. د. عبد الرحمن بن عبد العزيز السديس',
    mushaf: 'المصحف المرتل — إنتاج المركز السعودي للتلاوات القرآنية',
    mushafEn: 'Murattal mushaf — Saudi Center for Quranic Recitations',
    tag: 'المركز السعودي',
    tagEn: 'Saudi Center',
    photo: 'imam-sudais.webp',
    note: 'ما زال قيد التسجيل — ولم تُنشر سورة الأعراف بعد.',
  },
  /**
   * As-Sudais's complete murattal — the one he has been known by for years.
   *
   * The centre's production above is twenty surahs and has not grown since it
   * was added; al-A'raf still has not aired. Rather than leave the most
   * recognisable voice in the app at a sixth of a mushaf, this is the whole
   * thing, a different and much older recording of his, at 192 kbps on a host
   * that serves ranges.
   *
   * Both are kept because they are not the same performance — al-Fatiha runs
   * 64s in the centre's and 38s here — and a reader who picked one should not
   * silently be handed the other partway through.
   */
  'sudais-murattal': {
    route: 'sq',
    // complete; no need to ask
    fixedCount: 114,
    name: 'عبد الرحمن السديس',
    nameEn: 'Abdurrahman As-Sudais',
    fullName: 'أ. د. عبد الرحمن بن عبد العزيز السديس',
    mushaf: 'المصحف المرتل الكامل',
    mushafEn: 'Complete murattal mushaf',
    tag: 'كامل',
    tagEn: 'Complete',
    photo: 'imam-sudais.webp',
  },
  buayjan: {
    route: 'bu',
    name: 'عبد الله البعيجان',
    nameEn: "Abdullah Al-Bu'ayjan",
    fullName: 'أ. د. عبد الله بن عواد البعيجان',
    mushaf: 'المصحف المرتل — إنتاج المركز السعودي للتلاوات القرآنية',
    mushafEn: 'Murattal mushaf — Saudi Center for Quranic Recitations',
    tag: 'المركز السعودي',
    tagEn: 'Saudi Center',
    photo: 'imam-buayjan.webp',
    note: 'ما زال قيد التسجيل — تُضاف السور الجديدة تلقائيًا.',
  },
  /**
   * Al-Buayjan's mushaf from the Prophet's Mosque, all 114 of it.
   *
   * The centre's production above stops at 77. This is his complete one, and
   * a different recording again — five to twenty-three per cent apart from
   * the centre's across the surahs both hold, which is a different night, not
   * a different encode.
   */
  'buayjan-nabawi': {
    route: 'bn',
    name: 'عبد الله البعيجان',
    nameEn: "Abdullah Al-Bu'ayjan",
    fullName: 'أ. د. عبد الله بن عواد البعيجان',
    mushaf: 'المصحف المرتل من المسجد النبوي',
    mushafEn: "Murattal mushaf from the Prophet's Mosque",
    tag: 'المسجد النبوي',
    tagEn: "Prophet's Mosque",
    photo: 'imam-buayjan.webp',
    /**
     * Eight short surahs the length check reads as too long, and they are not.
     *
     * He recites the short ones slowly here — the ratio climbs smoothly the
     * shorter the surah gets, from 1.05x around surah 70 to 1.90x at
     * al-Aadiyaat, which is a pace, not a shuffle: files holding each other's
     * recitations scatter, they do not form a gradient. Every one of these
     * was then confirmed from the file's own ID3 title, which names the surah
     * it is served as — "سورة العاديات" in the file for 100, and so on for
     * all eight. Excluding them would drop eight surahs he really did record.
     */
    identityConfirmed: [80, 82, 92, 93, 95, 99, 100, 101],
  },
  /**
   * Al-Afasy's Hafs from the Ten Readings mushaf of 1445.
   *
   * That project records all ten readings; this is its Hafs from Asim, which
   * is the reading everything else in the app is built on — so it carries no
   * riwayah field and the mushaf page may show text against it. Picking up
   * one of its other readings by mistake would have put wording on screen
   * that disagrees with what is being recited.
   */
  afasy: {
    home: true,
    route: 'af',
    // complete
    fixedCount: 114,
    name: 'مشاري راشد العفاسي',
    nameEn: 'Mishary Rashid Al-Afasy',
    fullName: 'الشيخ مشاري بن راشد العفاسي',
    mushaf: 'مصحف القراءات العشر ١٤٤٥هـ - ٢٠٢٤م — برواية حفص عن عاصم',
    mushafEn: "Mushaf al-Qira'at al-Ashr, 1445 AH / 2024 — Hafs from Asim",
    photo: 'afasy.webp',
  },
  /**
   * Abdulaziz Al-Turki — a different man from Badr, above.
   *
   * Seven of the source item's files are numbered as each other, so seven
   * surahs are fetched from the file that actually holds them. See the remap.
   */
  'turki-abdulaziz': {
    route: 'az',
    home: true,
    // complete
    fixedCount: 114,
    name: 'عبد العزيز التركي',
    nameEn: 'Abdulaziz Al-Turki',
    fullName: 'الشيخ عبد العزيز التركي',
    mushaf: 'المصحف المرتل — إنتاج المركز السعودي للتلاوات القرآنية',
    mushafEn: 'Murattal mushaf — Saudi Center for Quranic Recitations',
    photo: 'turki-abdulaziz.webp',
    /**
     * `surah: file`. Two straight swaps and a three-cycle, settled twice
     * independently: against the centre's own publication of this mushaf,
     * where the corrected durations agree to within a fifth of a second, and
     * against the letters of the bundled text, where scoring each file
     * against the surah it claims puts six of these far outside the band the
     * other ninety-two sit in and the remap puts every one of them back
     * inside it.
     */
    remap: { 33: 34, 34: 33, 43: 45, 44: 43, 45: 44, 48: 49, 49: 48 },
    exclude: [],
  },
  /**
   * Al-Budair's murattal, published under that name in 2010.
   *
   * The recording is older than the publication — its tags say 2007 and it was
   * on the aggregators by 2006 — so 2010 is when it was compiled and released,
   * not when it was read.
   *
   * What this is emphatically not is the set the largest aggregator now serves
   * under his name. That was swapped in at some point after 2011 and is a
   * compilation of live Taraweeh from both Harams: a different performance
   * from end to end, at a different pace, in a different place.
   */
  budair: {
    route: 'bd',
    // complete
    fixedCount: 114,
    name: 'صلاح البدير',
    nameEn: 'Salah Al-Budair',
    fullName: 'الشيخ صلاح بن محمد البدير',
    mushaf: 'المصحف المرتل',
    mushafEn: 'Murattal mushaf',
    photo: 'imam-budair.webp',
  },
  /**
   * Ash-Shuraim's complete mushaf, assembled from the Grand Mosque itself.
   *
   * Thirty-five years of prayers — 1408 to 1443 — gathered into one khatmah,
   * which is what makes it the comprehensive one and what makes it a different
   * recording from his studio murattal of 2007. It is a curated compilation
   * rather than an official label release, and it is the only thing anywhere
   * that carries this title.
   */
  shuraim: {
    route: 'sr',
    // complete
    fixedCount: 114,
    name: 'سعود الشريم',
    nameEn: 'Saud Ash-Shuraim',
    fullName: 'أ. د. سعود بن إبراهيم الشريم',
    mushaf: 'المصحف الكامل من الحرم المكي',
    mushafEn: 'The complete mushaf, from the Grand Mosque',
    photo: 'imam-shuraim.webp',
  },
  /**
   * Al-Muaiqly's mushaf recorded in the King Fahd Complex's own studio.
   *
   * His own site lists exactly one album from the complex and calls it the
   * mujawwad, so "the new one from the King Fahd Complex" and "the mujawwad"
   * are the same recording. Not his 2008 murattal, which is what most sites
   * still serve under his name, and not the Hunain set: both run at visibly
   * different lengths.
   */
  muaiqly: {
    route: 'mq',
    // complete
    fixedCount: 114,
    name: 'ماهر المعيقلي',
    nameEn: 'Maher Al-Muaiqly',
    fullName: 'الشيخ ماهر بن حمد المعيقلي',
    mushaf: 'المصحف المجوَّد — مجمع الملك فهد لطباعة المصحف الشريف',
    mushafEn: 'Mujawwad mushaf — King Fahd Glorious Qur’an Printing Complex',
    photo: 'imam-muaiqly.webp',
    /**
     * Al-Waqi'ah and Abasa, which the length check reads at 1.46x and 1.54x.
     *
     * The item carries no ID3 at all, so identity was settled the way
     * Abdulaziz Al-Turki's was — against another recording of the same man.
     * Measured against his studio murattal, which is a different performance
     * at 1.7x the pace, those two surahs come out the longest of a
     * thirty-eight surah sample there as well, at 1.11x and 1.18x of that
     * recording's own median. The same two, long in both, by a man reading
     * mujawwad here: that is what he does with them.
     *
     * Their neighbours rule out the other reading. A file holding the wrong
     * surah has to have displaced something, and 57, 58, 79 and 81 all
     * measure normally. Nor are these two isolated: this recording's ratios
     * run 0.87 to 1.52 in a continuous spread — 81 at 1.41 and 83 at 1.34 sit
     * just under the threshold — so 1.46 is the top of a distribution, not a
     * spike out of one.
     */
    identityConfirmed: [56, 80],
  },
  /**
   * Baleelah's studio murattal — the one his own site links to.
   *
   * Not the copy the largest aggregator serves under his name: that is three
   * recordings spliced together, sixty files from this studio set, fifty-three
   * from a Haram compilation, and one lone surah read on a night of Ramadan
   * 1445. The only host that carries all 114 of the studio set encodes it at
   * about 64 kbps, which is poorer than anything else here and is the price of
   * having it whole and consistent.
   */
  baleela: {
    route: 'bl',
    // complete
    fixedCount: 114,
    name: 'بندر بليلة',
    nameEn: 'Bandar Baleela',
    fullName: 'الشيخ بندر بن عبد العزيز بليلة',
    mushaf: 'المصحف المرتل — برواية حفص عن عاصم',
    mushafEn: 'Murattal mushaf — Hafs from Asim',
    photo: 'imam-baleela.webp',
  },
  /**
   * Al-Qarafi, in the riwayah of Hafs from Asim — every file of the other
   * published copy says so in its tags, as does this collection's own page.
   *
   * Both copies in circulation are compilations rather than one mastered
   * album: the encoding changes from surah to surah and the pace changes with
   * it. This is the more coherent of the two, and the length check below drops
   * whatever still does not belong.
   */
  qarafi: {
    route: 'qa',
    name: 'عبد الله القرافي',
    nameEn: 'Abdullah Al-Qarafi',
    fullName: 'د. عبد الله القرافي',
    mushaf: 'المصحف المرتل — برواية حفص عن عاصم',
    mushafEn: 'Murattal mushaf — Hafs from Asim',
    photo: 'imam-qarafi.webp',
  },
  /**
   * Ash-Shamsan's mushaf, which is not finished.
   *
   * The Saudi Center has announced it and is releasing it a surah at a time,
   * so this is the seventy-odd that have aired — al-Baqarah, Aal-Imran and
   * al-Kahf are not yet among them. Published as what it is rather than held
   * back: a listener can hear what exists, and the rest arrives as it is
   * recorded.
   */
  shamsan: {
    route: 'ws',
    name: 'الوليد الشمسان',
    nameEn: 'Al-Waleed Ash-Shamsan',
    fullName: 'الشيخ الوليد بن عبد الله الشمسان',
    mushaf: 'المصحف المرتل',
    mushafEn: 'Murattal mushaf',
    photo: 'imam-shamsan.webp',
    note: 'ما زال قيد التسجيل — تُضاف السور الجديدة تلقائيًا.',
    // Its files are spread over a range of encodes and some are demonstrably
    // a different take; the length check keeps only what fits.
    partialOk: true,
  },
}

/**
 * Which surahs a source actually holds, in order.
 *
 * A count is not the same question. It is only the same answer while a mushaf
 * runs 1..N with nothing missing, and As-Sudais's does not — the Saudi Center
 * has not aired al-A'raf, so his mushaf is surahs 1-6 and 8-21. Asked for a
 * count of twenty, this job would have sized surahs 1 to 20 and written a
 * catalog that stops one short and is wrong about everything after the hole.
 */
async function publishedSurahs(src) {
  if (src.fixedCount) {
    return Array.from({ length: src.fixedCount }, (_, i) => i + 1)
  }
  // Always ask past the Worker's index cache. A stale list would make the job
  // conclude "nothing new" and skip surahs that have already aired.
  const res = await fetch(`${WORKER}/list/${src.route}?fresh=1`, {
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`list endpoint returned ${res.status}`)
  const { surahs } = await res.json()
  if (!Array.isArray(surahs) || !surahs.length) {
    throw new Error('list endpoint reported nothing published')
  }
  return surahs
}

/**
 * One range request, retried when the far end simply does not answer.
 *
 * Al-Juhany's files sit on a host that drops connections under any real
 * concurrency — a first pass over 114 surahs saw a third of them come back
 * 522 from the proxy. Those are not missing recordings and must not be
 * treated as holes in the catalog, so a few patient retries stand between a
 * flaky host and a wrong conclusion.
 */
async function fetchWithRetry(url, attempts = Number(process.env.REFRESH_ATTEMPTS ?? 4)) {
  let last = null
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { Range: 'bytes=0-131071' },
        signal: AbortSignal.timeout(120_000),
      })
      // 5xx from the proxy means it could not reach the origin, which is
      // worth another go; a 4xx is a real answer and is not retried.
      if (res.status < 500) return res
      last = new Error(`HTTP ${res.status}`)
    } catch (e) {
      last = e
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, Math.min(30_000, 2000 * 2 ** i)))
  }
  throw last ?? new Error('unreachable')
}

/**
 * Measures a surah and checks the audio is plausibly that surah.
 *
 * midad's files for four Burhaji surahs hold the wrong recitation — their
 * pages are labelled correctly, so nothing upstream reveals it. Only the
 * audio itself does: a surah whose length is wildly out of step with its text
 * is not that surah, and serving it would play the wrong recitation with no
 * warning. Reads the first 128 KB, which is enough for the frame header.
 */
async function measure(route, surah) {
  const res = await fetchWithRetry(`${WORKER}/${route}/${surah}.mp3`)
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)
  const cr = res.headers.get('content-range')
  const total = cr ? Number(/\/(\d+)\s*$/.exec(cr)?.[1]) : 0
  if (!total) throw new Error('no Content-Range')
  const buf = Buffer.from(await res.arrayBuffer())
  return { bytes: total, seconds: durationOf(buf, total) }
}

async function refresh(id) {
  const src = SOURCES[id]
  if (!src) throw new Error(`unknown reciter: ${id}`)

  const published = await publishedSurahs(src)
  const count = published.length
  const had = catalog.reciters.find((r) => r.id === id)?.surahs.length ?? 0
  console.log(`${id}: ${count} published (catalog has ${had})`)

  // A hole is worth saying out loud. It is the difference between a mushaf
  // that is partway recorded and one this job has misread.
  const holes = []
  for (let n = 1; n <= published[published.length - 1]; n++) {
    if (!published.includes(n)) holes.push(n)
  }
  if (holes.length) {
    console.log(`  not published within 1-${published[published.length - 1]}: ${holes.join(', ')}`)
  }

  const results = new Map()
  const failures = []
  const queue = [...published]

  async function run() {
    for (;;) {
      const surah = queue.shift()
      if (surah === undefined) return
      // Every surah is measured, never carried over. The catalog URL is
      // always `${WORKER}/${route}/${surah}.mp3`, so a "has the URL changed"
      // check can never fire — reusing sizes silently kept five surahs in the
      // catalog whose audio had been 404ing since they moved to the proxy.
      // Measuring is the only thing that proves a surah is actually reachable.
      // A locally hosted file is measured from disk, not over the network.
      if (src.localFiles?.[surah]) {
        const buf = readFileSync(`public/${src.localFiles[surah]}`)
        results.set(surah, { bytes: buf.length, seconds: durationOf(buf, buf.length) })
        continue
      }
      try {
        results.set(surah, await measure(src.route, src.remap?.[surah] ?? surah))
      } catch (e) {
        failures.push({ surah, error: e.message })
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, run))

  if (failures.length) {
    console.error(`  ${failures.length} failed:`)
    for (const f of failures.slice(0, 12)) console.error(`    ${f.surah}: ${f.error}`)

    /**
     * A source may simply not have every surah available.
     *
     * Al-Juhany's files are spread across a dozen top4top subdomains and
     * several of those are down — the same surahs fail every time, at the
     * connect timeout, while their neighbours answer in a second. Refusing
     * the whole mushaf over that would ship nothing rather than the 83 surahs
     * that do play, and the weekly refresh picks up the rest whenever those
     * hosts return.
     *
     * This stays opt-in per source, because for every other reciter a failed
     * measurement means something is wrong with our end and a hole would hide
     * it. A source that opts in must still deliver most of what it claims.
     */
    if (!src.partialOk) throw new Error(`${id}: refusing to write a catalog with holes`)
    const got = count - failures.length
    if (got < count * 0.5) {
      throw new Error(
        `${id}: only ${got} of ${count} surahs are reachable — too few to publish`,
      )
    }
    console.error(
      `  ${id}: publishing ${got} of ${count}; the rest are unreachable at the source`,
    )
  }

  // Seconds per letter should be roughly constant across a mushaf. Where it
  // is not, the file does not contain the surah it claims to.
  // Short surahs are dominated by the basmalah and pauses — Al-Fatiha runs
  // 1.35x its text length quite legitimately — so they are not judged.
  const MIN_LETTERS = 150
  const measured = [...results.entries()].filter(([, m]) => m.seconds != null)
  const rates = measured
    .filter(([surah]) => lettersIn(surah) >= MIN_LETTERS)
    .map(([surah, m]) => m.seconds / lettersIn(surah))
    .filter((r) => Number.isFinite(r) && r > 0)
    .sort((a, b) => a - b)

  const mismatched = []
  // Needs enough readable files for a median to mean anything.
  if (rates.length >= 30) {
    const median = rates[Math.floor(rates.length / 2)]
    for (const [surah, m] of measured) {
      const letters = lettersIn(surah)
      if (letters < MIN_LETTERS) continue
      // Identity settled some other way outranks a length that merely looks
      // odd. The check is a proxy for "is this the right surah", so where
      // that question already has a better answer, the proxy has no vote.
      // What the better answer was belongs in a comment on each source: an
      // ID3 title that names the surah, or a second recording of the same man
      // that reads it long too. A bare list is a way to wave a real defect
      // through, so no entry here is legitimate without its evidence written
      // down beside it.
      if (src.identityConfirmed?.includes(surah)) continue
      const factor = m.seconds / letters / median
      if (factor > 1.45 || factor < 0.69) mismatched.push({ surah, factor })
    }
  }
  const unreadable = results.size - measured.length
  console.log(
    `  measured ${measured.length}/${results.size}` +
      (unreadable ? ` (${unreadable} not MP3, length not checked)` : ''),
  )
  for (const surah of Object.keys(src.remap ?? {}).map(Number)) {
    console.log(`  remapped surah ${surah} -> file ${src.remap[surah]}`)
  }

  for (const surah of src.exclude ?? []) {
    if (results.delete(surah)) {
      console.warn(`  ! surah ${surah}: excluded — source files in this range are shuffled`)
    }
  }

  for (const x of mismatched) {
    console.warn(
      `  ! surah ${x.surah}: audio length is ${x.factor.toFixed(2)}x what the text implies — excluded`,
    )
    results.delete(x.surah)
  }

  const entry = {
    id,
    name: src.name,
    nameEn: src.nameEn,
    fullName: src.fullName,
    mushaf: src.mushaf,
    ...(src.mushafEn ? { mushafEn: src.mushafEn } : {}),
    // Absent means "not on the home screen" — see the Reciter type.
    ...(src.home ? { home: true } : {}),
    // Absent means Hafs, which is what everything else assumes.
    ...(src.riwayah ? { riwayah: src.riwayah, riwayahEn: src.riwayahEn } : {}),
    // Which of this sheikh's mushafs this is, for the grid that shows only
    // faces and names. Absent where the name is already unambiguous.
    ...(src.tag ? { tag: src.tag, tagEn: src.tagEn } : {}),
    ...(src.note ? { note: src.note } : {}),
    source: `${WORKER}/${src.route}/{surah}.mp3`,
    photo: src.photo,
    released: count,
    total: 114,
    surahs: published
      .filter((surah) => results.has(surah))
      .map((surah) => {
        return {
        surah,
        // A locally hosted file wins; otherwise a remapped surah is fetched
        // from the file that actually holds it.
        url: src.localFiles?.[surah]
          ? src.localFiles[surah]
          : `${WORKER}/${src.route}/${src.remap?.[surah] ?? surah}.mp3`,
        fallbackUrl: null,
        bytes: results.get(surah).bytes,
        // Files are resolved from each surah's own page, so the name-to-audio
        // association comes from the source rather than from a filename guess.
        // A remapped one is identified by duration, so it asks for an ear check.
        verified: !src.remap?.[surah] || !!src.earConfirmed?.includes(surah),
      }
    }),
  }
  entry.released = entry.surahs.length

  const idx = catalog.reciters.findIndex((r) => r.id === id)
  if (idx >= 0) catalog.reciters[idx] = entry
  else catalog.reciters.push(entry)

  return count - had
}

const targets = only ? [only] : Object.keys(SOURCES)
let added = 0
for (const id of targets) added += await refresh(id)

writeFileSync('data/catalog.json', JSON.stringify(catalog, null, 1))

console.log('')
for (const r of catalog.reciters) {
  const gb = r.surahs.reduce((a, s) => a + s.bytes, 0) / 1073741824
  console.log(
    `  ${r.id.padEnd(16)} ${String(r.surahs.length).padStart(3)}/114  ${gb.toFixed(2)} GB`,
  )
}
console.log(added > 0 ? `\n${added} new surah(s).` : '\nNo new surahs.')
