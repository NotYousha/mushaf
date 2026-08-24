import { describe, it, expect } from 'vitest'
import { judgeByVoice, MIN_GROUP } from '../scripts/lib/judge.mjs'

/** Every surah the same length, so a rate is purely the duration. */
const letters = () => 1000

/** [surah, seconds] pairs into the shape judgeByVoice consumes. */
const measure = (pairs) => pairs.map(([surah, seconds]) => [surah, { seconds }])

describe('judgeByVoice', () => {
  // The whole reason this function exists. Nine surahs at 50s and nine at
  // 120s share no meaningful median: sorted, the midpoint lands at 120, which
  // puts every one of the fast imam's surahs at 0.42x and deletes all nine.
  // Judged against his own pace, each imam sits at 1.0x.
  it('lets a fast imam and a slow imam coexist in one entry', () => {
    const voices = { A: [1, 2, 3, 4, 5, 6, 7, 8, 9], B: [10, 11, 12, 13, 14, 15, 16, 17, 18] }
    const voiceOf = (s) => (voices.A.includes(s) ? 'A' : 'B')
    const measured = measure([
      ...voices.A.map((s) => [s, 50]),
      ...voices.B.map((s) => [s, 120]),
    ])

    const { mismatched, judged, unjudged } = judgeByVoice(measured, voiceOf, letters)

    expect(mismatched).toEqual([])
    expect(judged.size).toBe(18)
    expect(unjudged).toEqual([])
  })

  // Stratifying must not blunt the check. A file holding the wrong recitation
  // still stands out against its own imam, which is what caught the four
  // Burhaji files that held each other's.
  it('still catches an outlier inside a single voice', () => {
    const surahs = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    const measured = measure(surahs.map((s) => [s, s === 9 ? 150 : 50]))

    const { mismatched, judged } = judgeByVoice(measured, () => 'A', letters)

    expect(mismatched).toHaveLength(1)
    expect(mismatched[0].surah).toBe(9)
    expect(mismatched[0].factor).toBeCloseTo(3, 5)
    expect(mismatched[0].voice).toBe('A')
    expect(judged.has(9)).toBe(true)
  })

  // A median of six samples is not a pace, it is a guess. Better to ship the
  // surahs unverified and let the VerifyPanel carry them than to delete a
  // legitimate recording on a median that means nothing.
  it('leaves a voice with fewer than MIN_GROUP surahs unjudged', () => {
    const surahs = [1, 2, 3, 4, 5, 6]
    expect(surahs.length).toBeLessThan(MIN_GROUP)
    const measured = measure(surahs.map((s) => [s, s === 6 ? 500 : 50]))

    const { mismatched, judged, unjudged } = judgeByVoice(measured, () => 'C', letters)

    expect(mismatched).toEqual([])
    expect(judged.size).toBe(0)
    expect(unjudged.sort((a, b) => a - b)).toEqual(surahs)
  })

  // Short surahs are dominated by the basmalah and by pauses, so their rate
  // carries no signal. Measured, never judged.
  it('never judges a surah below MIN_LETTERS', () => {
    const measured = measure([[1, 50], [2, 50], [3, 50], [4, 50], [5, 50], [6, 50], [7, 50], [8, 50], [9, 900]])
    // Surah 9 is the outlier, but its text is too short to judge.
    const lettersIn = (s) => (s === 9 ? 100 : 1000)

    const { mismatched, judged, unjudged } = judgeByVoice(measured, () => 'A', lettersIn)

    expect(mismatched).toEqual([])
    expect(judged.has(9)).toBe(false)
    expect(unjudged).not.toContain(9)
  })

  // A file this cannot parse — several sources serve .m4a — reports null
  // seconds. A garbage duration fed to the check silently drops good surahs.
  it('ignores surahs whose duration could not be read', () => {
    const measured = measure([[1, 50], [2, 50], [3, 50], [4, 50], [5, 50], [6, 50], [7, 50], [8, 50], [9, null]])

    const { judged, unjudged } = judgeByVoice(measured, () => 'A', letters)

    expect(judged.has(9)).toBe(false)
    expect(unjudged).not.toContain(9)
  })

  // The existing four reciters are one voice each, so they arrive here as a
  // single group and behave exactly as the whole-entry median did.
  it('treats a single-voice entry as one group', () => {
    const surahs = Array.from({ length: 40 }, (_, i) => i + 1)
    const measured = measure(surahs.map((s) => [s, s === 40 ? 100 : 50]))

    const { mismatched, judged } = judgeByVoice(measured, () => null, letters)

    expect(judged.size).toBe(40)
    expect(mismatched).toHaveLength(1)
    expect(mismatched[0].surah).toBe(40)
  })
})
