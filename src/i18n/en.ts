/**
 * English, and the shape every other language must fill.
 *
 * `Strings` is derived from this object, so adding a key here is what makes
 * the compiler demand it of the other four.
 */
export const en = {
  // Widened deliberately: this is the field every other language changes.
  dir: 'ltr' as 'ltr' | 'rtl',
  appTitle: 'Al Quran',
  search: 'Search surahs',
  surahWord: 'سُورَةُ',

  tabLibrary: 'Library',
  tabQuran: 'Quran',
  tabText: 'Mushaf',
  tabMore: 'More',

  reciter: 'Reciter',
  /** Precedes an imam's name on a surah from a multi-voice compilation. */
  recitedBy: 'Recited by',
  nextReciter: 'Next reciter',
  facesIntro:
    'Several imams lead across a Ramadan. Add a photo for any of them and it appears while he is reciting. Photos stay on this device.',
  faceAdd: 'Add photo',
  faceReplace: 'Replace',
  faceRemove: 'Remove',
  faceAdjust: 'Adjust',
  buildLabel: 'Version',
  favourites: 'Starred',
  favouritesEmpty:
    'Nothing starred yet. Tap the star while something is playing and it will be here.',
  favouritesCount: (n: number | string) => `${n} saved`,
  /** Browsing the archive by the man reciting rather than by the year. */
  imams: 'By reciter',
  // Honest about its reach: only the years whose recordings name their
  // reciters can appear here, which is not yet all of them.
  imamsIntro: 'The imams the archive names, and every surah they lead.',
  imamsBack: 'All reciters',
  /** Heading over the years whose surahs are attributed one by one. */
  imamNamed: 'Surahs named',
  /** Heading over the years known only as "he led that Ramadan". */
  imamLed: 'Ramadans he led',
  imamOpen: 'Open',
  lockScreen: 'Lock screen',
  lockScreenIntro:
    'What the phone’s lock screen and Dynamic Island are asking the app to do. Play something, lock the phone, try the controls, then come back and read this.',
  lockScreenNone: 'Nothing yet. Lock the phone and press a control.',
  copyReport: 'Copy report',
  copied: 'Copied',
  imamSurahs: (n: number | string, one: boolean) => `${n} ${one ? 'surah' : 'surahs'}`,
  imamYears: (n: number | string, one: boolean) => `${n} ${one ? 'year' : 'years'}`,
  imamHours: (n: number | string, one: boolean) => `${n} ${one ? 'hour' : 'hours'}`,
  /** Precedes a time, where an imam takes over partway into a surah. */
  imamFrom: (at: string) => `from ${at}`,
  facesExport: 'Save photos to a file',
  faceSourceYours: 'your photo',
  faceSourceApp: 'comes with the app',
  facesUseBundled: 'Use the photos that come with the app',
  facesCleared: (n: number) => `Removed ${n} of your own photos.`,
  facesImport: 'Load photos from a file',
  facesImported: (n: number) => `Loaded ${n} photos.`,
  checkUpdate: 'Update now',
  faceDone: 'Done',
  facePickFailed: 'That image could not be read.',
  dismiss: 'Dismiss',
  /** The transport's fixed jump, in seconds. */
  skipBack: (n: number | string) => `Back ${n} seconds`,
  skipForward: (n: number | string) => `Forward ${n} seconds`,
  /** The Grand Mosque year list, which stands apart from the reciter strip. */
  haramYears: 'Grand Mosque — Taraweeh by year',
  /** Short enough for a chip in the reciter strip. */
  haramShort: 'Haram Taraweeh',
  haramPick: 'Choose a year',
  haramCount: (n: number | string) => `${n} years`,
  haramLed: 'Led by',
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
  talqeen: 'Talqeen Mode',
  yourTurn: 'Your turn',
  listenNow: 'Listen',
  hearAgain: 'Hear it again',
  skipTurn: 'Skip',
  talqeenOn: 'Talqeen is on — the reciter reads a line, then leaves exactly that long for you.',
  talqeenNeedsTimings:
    'Talqeen needs word timings, which so far exist only for Muhammad Barhaji.',
  textSmaller: 'Smaller text',
  textLarger: 'Larger text',
  zoomedNote: 'Text is enlarged, so lines wrap and the page is no longer fifteen lines.',
  veil: 'Veil',
  veilName: { off: 'Full', faded: 'Faded', firsts: 'First word', blank: 'Hidden' },
  veilHint: 'Press and hold to peek.',
  stumbleMarked: 'Stumble marked.',
  stumble: 'Mark a stumble',
  tabHifz: 'Hifz',
  sabaq: 'Sabaq',
  sabqi: 'Sabqi',
  manzil: 'Manzil',
  tierName: { sabaq: 'Sabaq', sabqi: 'Sabqi', manzil: 'Manzil' },
  tiersNote: 'Pages, not percentages. Your teacher sets the lesson; the app only remembers it.',
  dueToday: 'Due today',
  nothingDue: 'Nothing is due right now.',
  noPagesYet: 'No pages recorded yet. Open the mushaf and review one to begin.',
  pageN: (n: number) => `Page ${n}`,
  review: 'Review',
  markClean: 'Clean',
  heatMap: 'Mushaf map',
  heatNote: 'All 604 pages. Darker means more stumbles and more peeking.',
  wird: 'Wird',
  wirdName: { seven: 'Seven days', thirty: 'Thirty days', ramadan: 'Ramadan' },
  wirdDay: (d: number, n: number) => `Day ${d} of ${n}`,
  wirdRange: (a: number, b: number) => `Pages ${a}–${b}`,
  pagesOwed: (n: number) => `${n} pages owed`,
  wirdUpToDate: 'You are on time.',
  readOnePage: 'One page',
  finishToday: 'Finished today',
  resetWird: 'Reset',
  forkDrill: 'Fork Drill',
  forkNote: 'A phrase that repeats, then parts. Listen, and at the split supply the next word yourself.',
  forkWords: (n: number) => `${n} shared words`,
  forkPlay: 'Play the shared phrase',
  forkListening: 'Listening…',
  forkYourWord: 'What comes next?',
  forkReveal: 'Hear both ways',
  forkHear: 'Hear',
  forkReplay: 'Again',
  forkNext: 'Another fork',
  forkAgain: 'Try again',
  forkNeedsTimings: 'The drill needs word timings, which so far exist only for Muhammad Barhaji.',
  forkFailed: 'Could not prepare a drill.',
  ayahRef: (s: number, a: number) => `${s}:${a}`,
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
  /** Heading over the two mosques' Ramadan archives, which are not
   *  reciters: a Ramadan is thirty nights and a dozen imams. */
  taraweeh: 'Taraweeh',
  /** The first tab: what the app opens on. */
  /** The control that returns to the screen a reciter was chosen from. */
  back: 'Back',
  tabHome: 'Home',
  /** Label over the card that takes you back to where you stopped. */
  continueReading: 'Continue Reading',
  /** The button on that card. Says what happens, not "Submit". */
  resumeHere: 'Resume',
  /** Opens the full list a section is showing the first few of. */
  seeAll: 'See all',
  /** Which verse the recitation had reached, where that is known. */
  verseAt: (n: number | string) => `Verse ${n}`,
  /** The continue card with nothing to continue: an invitation. */
  homeEmpty: 'Nothing yet. Play a surah and it will be waiting here.',
  /** The search control in the home header. */
  homeOpenSearch: 'Search',
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
  differentRiwayah: (r: string) => `This reciter reads ${r}. The wording differs from the Hafs text this mushaf shows, so the page is hidden rather than shown disagreeing with the voice.`,
  riwayahPages: (r: string) => `Printed in ${r}, the reading this reciter follows. Word-by-word following is not available for it.`,
  collapsePlayer: 'Minimise the player',
  expandPlayer: 'Show the player',
    appearance: 'Appearance',
    theme: 'Theme',
    modeName: { light: 'Light', dark: 'Dark', system: 'System' },
    bestAtNight: 'Made for the dark',
    openPlayer: 'Open the player',
    photoFraming: 'Reciter photos',
    /** Group heading over the individual mushafs, below the two
     *  mosque rosters. */
    facesMushafs: 'Mushafs',
    surfaceName: { player: 'Player', card: 'Dock card' },
    dragToPosition: 'Drag the photo to move it.',
    zoom: 'Zoom',
    resetFraming: 'Reset'
}

export type Strings = typeof en
