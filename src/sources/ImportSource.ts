import { matchFilename } from './matchFilename'

export type ImportResult = {
  matched: Array<{ surah: number; file: File }>
  unmatched: File[]
}

/**
 * Split device files into ones we can confidently place and ones needing
 * manual assignment. Nothing is ever silently dropped or guessed at.
 */
export async function importFiles(files: File[]): Promise<ImportResult> {
  const matched: ImportResult['matched'] = []
  const unmatched: File[] = []

  for (const file of files) {
    const surah = matchFilename(file.name)
    if (surah) matched.push({ surah, file })
    else unmatched.push(file)
  }

  return { matched, unmatched }
}
