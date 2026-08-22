export type Lang = 'ar' | 'en'

/**
 * Two full interface languages.
 *
 * Surah names stay in Arabic in both — the name of a surah is Arabic, and
 * transliterating it serves nobody. What changes is the supporting line: in
 * English the meaning appears beneath, in Arabic nothing does, because a
 * reader of Arabic does not need Al-Kahf glossed as "The Cave".
 */
export const STRINGS = {
  ar: {
    dir: 'rtl' as const,
    appTitle: 'المُتابَعة',
    search: 'البحث في السور',
    surahWord: 'سُورَةُ',

    tabLibrary: 'المكتبة',
    tabQuran: 'القرآن',
    tabText: 'المصحف',
    tabMore: 'المزيد',

    reciter: 'القارئ',
    saved: 'محفوظة',
    resumeAt: (p: number) => `متابعة التحميل من ${p}%`,
    streaming: 'بث',
    notRecorded: 'لم تُسجَّل بعد',
    excluded: 'مستبعَدة',
    save: 'حفظ',
    ayahs: 'آية',

    shuffle: 'ترتيب عشوائي',
    repeat: 'تكرار',
    favourite: 'المفضلة',
    speed: 'سرعة التشغيل',
    sleep: 'مؤقت النوم',
    play: 'تشغيل',
    pause: 'إيقاف',
    next: 'التالي',
    prev: 'السابق',
    position: 'موضع التشغيل',

    storage: 'التخزين',
    storageIntro:
      'تُشغَّل السور مباشرةً عبر الإنترنت، ولا يُحفَظ شيء على جهازك إلا إذا اخترت ذلك. السور المحفوظة تعمل بدون اتصال.',
    usedOf: (a: string, b: string) => `${a} مستخدَمة من ${b}`,
    savedCount: (n: number) => `محفوظة لهذا القارئ: ${n} سورة`,
    downloadAll: 'تحميل المصحف كاملًا',
    downloadAllSize: (s: string) => `تحميل الكل · ${s}`,
    deleteSaved: 'حذف المحفوظ',
    downloading: (done: number, total: number) => `جارٍ التحميل ${done} من ${total}`,
    cancelAll: 'إيقاف التحميل',
    notEnoughSpace: (need: string, free: string) =>
      `المساحة غير كافية: يحتاج ${need} ومتاح ${free}`,
    saveFailed: (why: string) => `تعذّر الحفظ: ${why}`,
    // The device filled up mid-download, so the queue stopped on its own.
    // What is already saved stays saved and can be continued later.
    outOfSpaceStopped:
      'امتلأت مساحة الجهاز، فتوقّف التحميل. احذف بعض الملفات ثم تابع؛ ما حُمِّل محفوظ.',

    confirmTitle: 'تحميل المصحف كاملًا؟',
    confirmBody: (reciter: string, count: number, size: string) =>
      `سيُحفَظ ${count} سورة بصوت ${reciter} على جهازك (${size}). يُفضَّل استخدام شبكة واي فاي.`,
    confirmYes: 'تحميل',
    confirmNo: 'إلغاء',

    settings: 'الإعدادات',
    language: 'اللغة',
    arabic: 'العربية',
    english: 'English',
    reciters: 'القُرّاء',
    recorded: (n: number) => `مُسجَّل: ${n} من 114`,

    verify: 'التحقق بالسماع',
    verifyIntro:
      'قد يحتوي ملف عند المصدر تلاوة سورة أخرى. إن سمعت سورة غير التي اخترتها، علِّمها «خطأ» فتُستبعَد من التشغيل فورًا.',
    verifyExcluded: (n: number) => `مستبعَدة: ${n}`,
    verifyUnjudged: (n: number) => `لم تُراجَع بعد: ${n}`,
    showAll: (n: number) => `عرض كل السور (${n})`,
    showExcluded: 'عرض المستبعَدة فقط',
    correct: 'صحيح',
    wrong: 'خطأ',
    allClear: 'لا توجد سور مستبعَدة لهذا القارئ.',
    removedFromPlayback: 'مستبعَدة من التشغيل',
    cannotPlay: 'تعذّر التشغيل',

    importTitle: 'إضافة ملفات',
    importIntro: (reciter: string) =>
      `أضِف تسجيلات من جهازك لتُحفَظ ضمن ${reciter} وتعمل بدون اتصال.`,
    importPick: 'اختيار ملفات صوتية',
    importReady: (ready: number, total: number, size: string) =>
      `${ready} جاهزة من ${total} · ${size}`,
    importChoose: '— اختر السورة —',
    importSave: (n: number) => `حفظ ${n} سورة`,
    importSaving: 'جارٍ الحفظ…',
    importSaved: (n: number, reciter: string) => `حُفِظت ${n} سورة ضمن ${reciter}.`,
    importClash: (list: string) => `أكثر من ملف لنفس السورة: ${list} — سيُحفَظ الأخير فقط.`,
    remove: 'إزالة',
    cancel: 'إلغاء',
    noResults: 'لا توجد نتائج',
    loading: 'جارٍ التحميل…',
    pickSurahForText: 'اختر سورة لعرض المصحف.',
    noTimings: 'تتبُّع الكلمات متاح لهذا القارئ فقط عند توفّر توقيتات التلاوة.',
    page: 'صفحة',
    cast: 'التشغيل على جهاز آخر',
    castOffline: 'البث إلى جهاز آخر يتم عبر الإنترنت؛ النسخة المحفوظة تبقى على هذا الجهاز.',
    storageSafe: 'التخزين دائم: لن يحذف المتصفح ما حفظته.',
    storageAtRisk:
      'قد يحذف المتصفح ما حفظته عند امتلاء الجهاز. أضِف التطبيق إلى الشاشة الرئيسية لحمايته.',
  },

  en: {
    dir: 'ltr' as const,
    appTitle: 'Continue',
    search: 'Search surahs',
    surahWord: 'سُورَةُ',

    tabLibrary: 'Library',
    tabQuran: 'Quran',
    tabText: 'Mushaf',
    tabMore: 'More',

    reciter: 'Reciter',
    saved: 'saved',
    resumeAt: (p: number) => `Resume from ${p}%`,
    streaming: 'streaming',
    notRecorded: 'not recorded yet',
    excluded: 'excluded',
    save: 'Save',
    ayahs: 'ayahs',

    shuffle: 'Shuffle',
    repeat: 'Repeat',
    favourite: 'Favourite',
    speed: 'Playback speed',
    sleep: 'Sleep timer',
    play: 'Play',
    pause: 'Pause',
    next: 'Next',
    prev: 'Previous',
    position: 'Playback position',

    storage: 'Storage',
    storageIntro:
      'Surahs stream over the network by default. Nothing is stored on your device unless you choose to save it. Saved surahs play with no signal.',
    usedOf: (a: string, b: string) => `${a} used of ${b}`,
    savedCount: (n: number) => `${n} surahs saved for this reciter`,
    downloadAll: 'Download the whole Quran',
    downloadAllSize: (s: string) => `Download all · ${s}`,
    deleteSaved: 'Delete saved audio',
    downloading: (done: number, total: number) => `Downloading ${done} of ${total}`,
    cancelAll: 'Stop downloading',
    notEnoughSpace: (need: string, free: string) =>
      `Not enough space: needs ${need}, ${free} free`,
    saveFailed: (why: string) => `Could not save: ${why}`,
    outOfSpaceStopped:
      'Your device ran out of space, so downloading stopped. Free some up and continue — what already downloaded is kept.',

    confirmTitle: 'Download the whole Quran?',
    confirmBody: (reciter: string, count: number, size: string) =>
      `This saves ${count} surahs recited by ${reciter} to your device (${size}). Best done on Wi-Fi.`,
    confirmYes: 'Download',
    confirmNo: 'Cancel',

    settings: 'Settings',
    language: 'Language',
    arabic: 'العربية',
    english: 'English',
    reciters: 'Reciters',
    recorded: (n: number) => `Recorded: ${n} of 114`,

    verify: 'Check by ear',
    verifyIntro:
      "A file at the source can hold a different surah's recitation. If you hear the wrong surah, mark it Wrong and it is removed from playback immediately.",
    verifyExcluded: (n: number) => `Excluded: ${n}`,
    verifyUnjudged: (n: number) => `Not yet checked: ${n}`,
    showAll: (n: number) => `Show all surahs (${n})`,
    showExcluded: 'Show excluded only',
    correct: 'Correct',
    wrong: 'Wrong',
    allClear: 'No surahs are excluded for this reciter.',
    removedFromPlayback: 'removed from playback',
    cannotPlay: 'Could not play',

    importTitle: 'Add files',
    importIntro: (reciter: string) =>
      `Add recordings from your device. They are saved under ${reciter} and play offline.`,
    importPick: 'Choose audio files',
    importReady: (ready: number, total: number, size: string) =>
      `${ready} of ${total} ready · ${size}`,
    importChoose: '— choose surah —',
    importSave: (n: number) => `Save ${n} surahs`,
    importSaving: 'Saving…',
    importSaved: (n: number, reciter: string) => `Saved ${n} surahs under ${reciter}.`,
    importClash: (list: string) =>
      `More than one file for the same surah: ${list} — only the last is kept.`,
    remove: 'Remove',
    cancel: 'Cancel',
    noResults: 'No results',
    loading: 'Loading…',
    pickSurahForText: 'Pick a surah to open the mushaf.',
    noTimings: 'Word tracking needs recitation timings, which are not published for this reciter.',
    page: 'Page',
    cast: 'Play on another device',
    castOffline: 'Casting streams over the internet; your saved copy stays on this phone.',
    storageSafe: 'Storage is persistent: the browser will not delete what you save.',
    storageAtRisk:
      'The browser may delete saved audio when your device runs low. Add this app to your Home Screen to protect it.',
  },
} as const

export type Strings = (typeof STRINGS)['en']

export const stringsFor = (lang: Lang): Strings => STRINGS[lang] as unknown as Strings
