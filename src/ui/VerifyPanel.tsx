import { useEffect, useMemo, useRef, useState } from 'react'
import type { SurahView } from '../catalog/types'
import type { Verdict } from '../catalog/verification'
import type { Strings } from '../i18n'
import { Play, Pause, Saved } from './Icons'

const PREVIEW_SECONDS = 20

type Props = {
  reciterId: string
  surahs: SurahView[]
  verdicts: Record<string, Verdict>
  t: Strings
  onVerdict: (surah: number, verdict: Verdict) => void
}

/**
 * Ear check.
 *
 * Sources do ship files holding the wrong recitation. Where the surahs differ
 * in length that can be measured and caught before it ever reaches the app,
 * but Al-Aadiyaat and Al-Qaari'a are within seconds of each other, so a swap
 * between them is invisible to any measurement and only an ear will notice.
 * Marking one wrong removes it from playback immediately.
 */
export function VerifyPanel({ reciterId, surahs, verdicts, t, onVerdict }: Props) {
  const [playing, setPlaying] = useState<number | null>(null)
  const [failed, setFailed] = useState<Record<number, string>>({})
  const [showAll, setShowAll] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stop = () => {
    audio.current?.pause()
    if (stopTimer.current) clearTimeout(stopTimer.current)
    setPlaying(null)
  }

  // A preview must never outlive the panel or bleed into the main player.
  useEffect(() => () => stop(), [])
  useEffect(() => stop(), [reciterId])

  const verdictFor = (surah: number): Verdict | undefined =>
    verdicts[`${reciterId}:${surah}`]

  const rejected = useMemo(
    () => surahs.filter((s) => verdictFor(s.surah) === 'wrong'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [surahs, verdicts, reciterId],
  )
  const unjudged = useMemo(
    () => surahs.filter((s) => !verdictFor(s.surah)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [surahs, verdicts, reciterId],
  )

  const listed = showAll ? surahs : rejected

  const preview = async (s: SurahView) => {
    if (stopTimer.current) clearTimeout(stopTimer.current)
    if (playing === s.surah) return stop()
    if (!s.url) return

    if (!audio.current) audio.current = new Audio()
    const el = audio.current
    el.pause()
    el.src = s.url
    el.currentTime = 0

    try {
      await el.play()
      setPlaying(s.surah)
      setFailed((f) => {
        const next = { ...f }
        delete next[s.surah]
        return next
      })
      stopTimer.current = setTimeout(() => {
        el.pause()
        setPlaying(null)
      }, PREVIEW_SECONDS * 1000)
    } catch {
      setFailed((f) => ({ ...f, [s.surah]: t.cannotPlay }))
      setPlaying(null)
    }
  }

  const decide = (s: SurahView, verdict: Verdict) => {
    stop()
    onVerdict(s.surah, verdict)
  }

  return (
    <div className="panel">
      <h2>{t.verify}</h2>
      <p>{t.verifyIntro}</p>

      <p className="count">
        {t.verifyExcluded(rejected.length)} · {t.verifyUnjudged(unjudged.length)}
      </p>

      <button className="btn" onClick={() => setShowAll(!showAll)}>
        {showAll ? t.showExcluded : t.showAll(surahs.length)}
      </button>

      {!listed.length && (
        <p className="all-clear">
          <Saved size={20} /> {t.allClear}
        </p>
      )}

      <ul className="verify-list">
        {listed.map((s) => {
          const v = verdictFor(s.surah)
          return (
            <li key={s.surah} className="verify-row">
              <button
                className="mini preview"
                onClick={() => void preview(s)}
                aria-label={playing === s.surah ? t.pause : t.play}
              >
                {playing === s.surah ? <Pause size={18} /> : <Play size={18} />}
              </button>

              <span className="verify-names">
                <span className="name-ar">
                  {s.surah}. {t.surahWord} {s.name}
                </span>
                <span className="name-plain">
                  {s.nameEn} · {s.translation}
                </span>
                {v === 'wrong' && <span className="verify-err">{t.removedFromPlayback}</span>}
                {failed[s.surah] && <span className="verify-err">{failed[s.surah]}</span>}
              </span>

              <span className="verify-actions">
                <button
                  className="btn tiny ok"
                  aria-pressed={v === 'ok'}
                  onClick={() => decide(s, 'ok')}
                >
                  {t.correct}
                </button>
                <button
                  className="btn tiny no"
                  aria-pressed={v === 'wrong'}
                  onClick={() => decide(s, 'wrong')}
                >
                  {t.wrong}
                </button>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
