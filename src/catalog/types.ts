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
  bytes: number
}
