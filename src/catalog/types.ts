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
  note?: string
  /** File in public/, shown in the player medallion. */
  photo?: string | null
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
