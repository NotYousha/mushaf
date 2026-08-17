export interface AudioSource {
  id: string
  name: string
  fetchSurah(
    surah: number,
    onProgress: (loaded: number, total: number) => void,
    signal: AbortSignal,
  ): Promise<Blob>
}
