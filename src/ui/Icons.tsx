type P = { size?: number }

const s = (n = 22) => ({ width: n, height: n, viewBox: '0 0 24 24', fill: 'none' })

export const Shuffle = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </svg>
)

export const Repeat = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </svg>
)

export const RepeatOne = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    <path d="M11 15v-5l-1.5 1" />
  </svg>
)

export const Search = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </svg>
)

export const Play = ({ size }: P) => (
  <svg {...s(size)} fill="currentColor">
    <path d="M8 5.2c0-.9 1-1.5 1.8-1L19 9.9c.7.5.7 1.6 0 2.1l-9.2 5.8c-.8.5-1.8-.1-1.8-1V5.2Z" />
  </svg>
)

export const Pause = ({ size }: P) => (
  <svg {...s(size)} fill="currentColor">
    <rect x="6.5" y="5" width="3.8" height="14" rx="1.4" />
    <rect x="13.7" y="5" width="3.8" height="14" rx="1.4" />
  </svg>
)

/**
 * A plain arrow, for going back a screen.
 *
 * `Back` below is two stacked triangles — a rewind, which is what it is for
 * in the transport. Using it in the header said "skip to the beginning" where
 * the button means "the screen you came from", and it read as a rewind
 * because it is one.
 */
export const ArrowBack = ({ size }: P) => (
  <svg {...s(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 5 8 12l7 7" />
  </svg>
)

export const Back = ({ size }: P) => (
  <svg {...s(size)} fill="currentColor">
    <path d="M11.6 6.3c0-.8-.9-1.3-1.6-.9L3.5 9.5c-.7.4-.7 1.4 0 1.8l6.5 4.1c.7.4 1.6-.1 1.6-.9V6.3Z" />
    <path d="M21 6.3c0-.8-.9-1.3-1.6-.9l-6.5 4.1c-.7.4-.7 1.4 0 1.8l6.5 4.1c.7.4 1.6-.1 1.6-.9V6.3Z" />
  </svg>
)

export const Forward = ({ size }: P) => (
  <svg {...s(size)} fill="currentColor">
    <path d="M12.4 6.3c0-.8.9-1.3 1.6-.9l6.5 4.1c.7.4.7 1.4 0 1.8L14 15.4c-.7.4-1.6-.1-1.6-.9V6.3Z" />
    <path d="M3 6.3c0-.8.9-1.3 1.6-.9l6.5 4.1c.7.4.7 1.4 0 1.8l-6.5 4.1c-.7.4-1.6-.1-1.6-.9V6.3Z" />
  </svg>
)

/**
 * Jump back or forward by a fixed number of seconds.
 *
 * A near-closed circle with the gap at the top, the arrowhead sitting exactly
 * on the arc's own endpoint and tangent to it, and the amount inside. The two
 * are mirror images about x=12, so they cannot drift apart.
 *
 * `label` arrives already written in the reader's digits — ١٠ for an Arabic
 * reader, 10 for everyone else — so this never formats a number itself.
 */
const skipDigits = (label: string) => (
  <text
    x="12"
    y="15.4"
    textAnchor="middle"
    fontSize="8.5"
    fontWeight="700"
    letterSpacing="-0.4"
    stroke="none"
    fill="currentColor"
  >
    {label}
  </text>
)

export const SkipBack = ({ size, label }: P & { label: string }) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7.76 6.54A7.4 7.4 0 1 0 16.24 6.54" />
    <path d="M16.24 6.54 19.87 6.76 17.69 9.87Z" fill="currentColor" />
    {skipDigits(label)}
  </svg>
)

export const SkipForward = ({ size, label }: P & { label: string }) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16.24 6.54A7.4 7.4 0 1 1 7.76 6.54" />
    <path d="M7.76 6.54 4.13 6.76 6.31 9.87Z" fill="currentColor" />
    {skipDigits(label)}
  </svg>
)

/**
 * Jump to where the recitation changes hands.
 *
 * A head-and-shoulders silhouette with a forward chevron: the subject is who
 * is reciting, not where you are in the file, so it deliberately does not
 * borrow the transport's arrows.
 */
export const NextVoice = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="7.5" r="3.2" />
    <path d="M3.4 18.5a5.6 5.6 0 0 1 11.2 0" />
    <path d="M17.8 8.6 21.2 12l-3.4 3.4" />
  </svg>
)

export const Moon = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </svg>
)

export const Star = ({ size, filled }: P & { filled?: boolean }) => (
  <svg {...s(size)} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d="m12 4 2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8L12 4Z" />
  </svg>
)

export const Handle = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <path d="M5 9h14M5 15h14" />
  </svg>
)

export const Download = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v10m0 0 3.5-3.5M12 14l-3.5-3.5" />
    <path d="M5 17.5v1A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-1" />
  </svg>
)

export const Saved = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.4 12.2 2.4 2.4 4.8-4.9" />
  </svg>
)

/* --- tab bar --- */
/* A house, for the tab the app opens on. Stroked like the rest of the set;
   the dock fills it with the accent when it is the active tab. */
export const Home = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.7 10.9 12 4.3l8.3 6.6V19a1.3 1.3 0 0 1-1.3 1.3h-3.4v-5a1 1 0 0 0-1-1h-3.2a1 1 0 0 0-1 1v5H5A1.3 1.3 0 0 1 3.7 19Z" />
  </svg>
)

export const Library = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 6.5S10 4.8 6.6 4.8c-1.3 0-2 .2-2.3.3a.6.6 0 0 0-.3.5v12c0 .4.4.7.8.6.5-.1 1.1-.2 2-.2 3 0 5.2 1.7 5.2 1.7s2.2-1.7 5.2-1.7c.9 0 1.5.1 2 .2.4.1.8-.2.8-.6v-12a.6.6 0 0 0-.3-.5c-.3-.1-1-.3-2.3-.3C14 4.8 12 6.5 12 6.5Zm0 0V19" />
  </svg>
)

export const QuranMark = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d="M12 3.2 20.8 12 12 20.8 3.2 12 12 3.2Z" />
    <path d="M12 7.6 16.4 12 12 16.4 7.6 12 12 7.6Z" />
  </svg>
)

export const Broadcast = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <circle cx="12" cy="12" r="2.4" />
    <path d="M8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6" />
    <path d="M5.4 18.6a9.4 9.4 0 0 1 0-13.2M18.6 5.4a9.4 9.4 0 0 1 0 13.2" />
  </svg>
)

export const More = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <circle cx="4.6" cy="6.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.6" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.6" cy="17.5" r="1" fill="currentColor" stroke="none" />
  </svg>
)

export const Cast = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 17.5a3.5 3.5 0 0 1 3.5 3.5M3 13a8 8 0 0 1 8 8M3 8.5A12.5 12.5 0 0 1 15.5 21" />
    <path d="M8 5.5V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
  </svg>
)

/** Talqeen: a voice speaking, and the same phrase answering back. */
export const Talqeen = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9v6" />
    <path d="M7.5 6.5v11" />
    <path d="M11 9.5v5" />
    <path d="M15.5 4.5A7.5 7.5 0 0 1 15.5 19.5" />
    <path d="M18.5 7.5a4.5 4.5 0 0 1 0 9" />
  </svg>
)

/** Marking a stumble: a flag planted at the place you lost the thread. */
export const Stumble = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 21V4" />
    <path d="M5 4h11l-2 3.5L16 11H5" />
  </svg>
)

/** Hifz: what is held in the heart. */
export const Heart = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20s-7-4.6-7-9.3A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.7C19 15.4 12 20 12 20Z" />
  </svg>
)

/** Points down to fold the player away; flipped by CSS to point back up. */
export const Chevron = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

/** Full screen: four corners pushing outward. */
export const Expand = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
  </svg>
)

/** Out of full screen: the same four corners pulling in. */
export const Collapse = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9h6V3M21 9h-6V3M3 15h6v6M21 15h-6v6" />
  </svg>
)

/** A bare tick, for the mushaf that is chosen. Saved is a tick in a ring and
 *  means something else — a surah already on the device. */
export const Check = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
)

/** A ribbon, for a page kept. Filled once it is. */
export const Bookmark = ({ size, filled }: P & { filled?: boolean }) => (
  <svg
    {...s(size)}
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinejoin="round"
    fill={filled ? 'currentColor' : 'none'}
  >
    <path d="M6.5 3.5h11a1 1 0 0 1 1 1v15.6a.6.6 0 0 1-.94.5L12 16.6l-5.56 4a.6.6 0 0 1-.94-.5V4.5a1 1 0 0 1 1-1Z" />
  </svg>
)

/** Translation: an alif beside a Latin A, with the rule between them. */
export const Translate = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6.5h7M7.5 4.5v2M9.2 6.5c0 3.4-2.2 6.2-5.2 7.4M6 10.6c1 1.7 2.6 3 4.4 3.6" />
    <path d="m13 20 3.6-9 3.6 9M14.4 17.2h4.4" />
  </svg>
)
