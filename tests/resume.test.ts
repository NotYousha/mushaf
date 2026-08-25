import { describe, it, expect, beforeEach } from 'vitest'
import { getDB } from '../src/db/index'
import { savePosition, loadPosition } from '../src/db/prefs'

beforeEach(async () => {
  const db = await getDB()
  await db.clear('prefs')
})

/**
 * The engine writes the playhead every five seconds, on pause, and when the
 * app goes to the background. Everything except the seconds was being read
 * back — so someone an hour and a half into a Taraweeh night reopened the app
 * at 00:00 of a hundred-minute recording, with a four-pixel scrubber to find
 * their place again.
 */
describe('where the last session stopped', () => {
  it('keeps the second, not just the surah', async () => {
    await savePosition('haram-1447', 2, 5432.5)
    const pos = await loadPosition()
    expect(pos).not.toBeNull()
    expect(pos!.reciterId).toBe('haram-1447')
    expect(pos!.surah).toBe(2)
    expect(pos!.seconds).toBe(5432.5)
  })

  it('survives a position written before reciters were a thing', async () => {
    const db = await getDB()
    await db.put('prefs', { surah: 18 }, 'lastPosition')
    const pos = await loadPosition()
    // The oldest recordings were Al-Dosari's, and nothing was resumed then.
    expect(pos).toEqual({ reciterId: 'dosari', surah: 18, seconds: 0 })
  })

  it('is null when nothing has been played', async () => {
    expect(await loadPosition()).toBeNull()
  })
})
