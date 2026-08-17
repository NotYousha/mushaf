export type CatalogEntry = {
  surah: number
  name: string
  url: string
  fallbackUrl?: string | null
  bytes: number
  verified: boolean
}

export type Catalog = {
  reciter: string
  mushaf: string
  released: number
  total: number
  surahs: CatalogEntry[]
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
