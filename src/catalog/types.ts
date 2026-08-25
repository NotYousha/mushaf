export type CatalogEntry = {
  surah: number
  url: string
  fallbackUrl?: string | null
  bytes: number
  verified: boolean
  /**
   * Who recites this surah, when the entry is a compilation rather than one
   * sheikh's mushaf — Taraweeh at the Haram rotates imams across the month.
   * Absent means the entry has a single voice, already named on the reciter.
   */
  voice?: string
  voiceEn?: string
  /**
   * The reciter's portrait, when exactly one imam recited this surah.
   *
   * Absent where several did — a face is a claim about one person, and a
   * surah spanning nights has no single one to show.
   */
  voicePhoto?: string
  /** Roster id of that reciter, which the medallion's crop is keyed to. */
  voiceId?: string
}

/** How a portrait is cropped on one surface, as the percentages CSS wants. */
export type Frame = { zoom: number; x: number; y: number }

export type Reciter = {
  id: string
  name: string
  nameEn: string
  fullName: string
  mushaf: string
  mushafEn?: string
  /**
   * The reading this mushaf follows, when it is not Hafs.
   *
   * Absent means Hafs from Asim, which is what the app's Quran text and every
   * other reciter here assume. A reciter who carries this field is reading
   * different wording, so anything that pairs audio with the bundled text has
   * to stand down rather than show a page that does not match.
   */
  riwayah?: string
  riwayahEn?: string
  /**
   * Which of this sheikh's mushafs this is, in two or three words.
   *
   * Several men here now have more than one — As-Sudais's Saudi Center
   * recording beside his complete murattal, Al-Juhany's Ad-Duri beside his
   * Hafs — and the grid on "See all" shows a face and a name and nothing
   * else, so without this they are two identical cards. Absent where the name
   * already tells you which mushaf you are choosing, which is most of them.
   */
  tag?: string
  tagEn?: string
  note?: string
  /**
   * Whether this mushaf is one of the few shown on the home screen.
   *
   * The home screen is a landing place, not a directory: a grid that grows
   * every time a reciter is added stops being glanceable somewhere around a
   * dozen. Everyone is one tap away under "See all", which is the screen that
   * is meant to be a directory. Absent means "not on the home screen".
   */
  home?: boolean
  /** File in public/, shown in the player medallion. */
  photo?: string | null
  /**
   * How that portrait is framed, where showing it whole is wrong.
   *
   * Every bundled portrait is a square crop, which is not the same as being
   * well composed: the player draws a circle and cuts the corners off, and a
   * face that sat comfortably in the square can sit low in the ring. This is
   * where an adjustment made in the settings is kept once it is meant to
   * reach everyone rather than the one device it was made on.
   *
   * Absent means centred and whole, which is right for most of them. Merged
   * in from data/reciter-frames.json rather than stored in the catalog itself,
   * because the catalog is regenerated from the audio sources every week and
   * would throw a hand-made framing away.
   */
  frames?: { player?: Frame; card?: Frame }
  source?: string
  /**
   * A family this entry belongs to, when it is one of many of a kind.
   *
   * 'haram' marks a year of the Grand Mosque's mushaf. Thirty-three of them
   * would bury the four individual mushafs in the reciter strip, so they are
   * held out of it and shown in their own year list instead.
   */
  group?: string
  /** Hijri year, for a grouped entry that is one. */
  year?: number
  /** The Gregorian year it fell in, as the source itself states it. */
  ce?: number | null
  released: number
  total: number
  surahs: CatalogEntry[]
}

export type Catalog = {
  generated: string
  reciters: Reciter[]
}

export type SurahMeta = {
  surah: number
  name: string
  nameEn: string
  translation: string
  ayahs: number
  revelation: string
}

export type SurahView = {
  surah: number
  name: string
  nameEn: string
  translation: string
  ayahs: number
  released: boolean
  verified: boolean
  url: string | null
  /** Alternate host for the same audio. Archive.org nodes rotate and
   *  individual nodes go unhealthy, so playback retries here on error. */
  fallbackUrl: string | null
  bytes: number
  /** Who recites this surah, or null for a single-voice mushaf. */
  voice: string | null
  voiceEn: string | null
  /** That reciter's portrait, when the surah has exactly one. */
  voicePhoto: string | null
  voiceId: string | null
}
