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
