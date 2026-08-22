export type CatalogEntry = {
  surah: number
  name: string
  url: string
  fallbackUrl?: string | null
  bytes: number
  verified: boolean
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
}
