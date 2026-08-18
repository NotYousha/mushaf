import { useEffect, useRef, useState } from 'react'
import type { SurahView } from '../catalog/types'
import { Play, Pause, Saved } from './Icons'

const PREVIEW_SECONDS = 15

type Props = {
  reciterId: string
  unverified: SurahView[]
  onVerdict: (surah: number, verdict: 'ok' | 'wrong') => void
}

/**
 * Ear check for entries the catalog could not confirm.
 *
 * Al-Dosari's mirrors are numbered by broadcast episode rather than by surah,
 * so a file named 16.mp3 may legitimately hold surah 18. Byte-size comparison
 * settled most of them; the rest need someone to listen. Plays the opening
 * seconds straight from the network — no download — so confirming the whole
 * list costs a few minutes and nothing on disk.
 */
export function VerifyPanel({ reciterId, unverified, onVerdict }: Props) {
  const [playing, setPlaying] = useState<number | null>(null)
  const [failed, setFailed] = useState<Record<number, string>>({})
  const audio = useRef<HTMLAudioElement | null>(null)
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // A preview must never outlive the panel or bleed into the main player.
    return () => {
      audio.current?.pause()
      if (stopTimer.current) clearTimeout(stopTimer.current)
    }
  }, [])

  // Switching reciter invalidates whatever was previewing.
  useEffect(() => {
    audio.current?.pause()
    setPlaying(null)
  }, [reciterId])

  const preview = async (s: SurahView) => {
    if (stopTimer.current) clearTimeout(stopTimer.current)

    if (playing === s.surah) {
      audio.current?.pause()
      setPlaying(null)
      return
    }

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
        const { [s.surah]: _drop, ...rest } = f
        return rest
      })
      stopTimer.current = setTimeout(() => {
        el.pause()
        setPlaying(null)
      }, PREVIEW_SECONDS * 1000)
    } catch {
      setFailed((f) => ({ ...f, [s.surah]: 'تعذّر التشغيل' }))
      setPlaying(null)
    }
  }

  const decide = (s: SurahView, verdict: 'ok' | 'wrong') => {
    audio.current?.pause()
    if (stopTimer.current) clearTimeout(stopTimer.current)
    setPlaying(null)
    onVerdict(s.surah, verdict)
  }

  if (!unverified.length) {
    return (
      <div className="panel">
        <h2>التحقق</h2>
        <p className="all-clear">
          <Saved size={20} /> كل السور مؤكَّدة لهذا القارئ.
        </p>
      </div>
    )
  }

  return (
    <div className="panel">
      <h2>التحقق بالسماع</h2>
      <p>
        مصادر هذه السور مُرقَّمة بحسب ترتيب البث لا بحسب رقم السورة، فقد لا يتطابق اسم
        الملف مع السورة. استمع إلى أول {PREVIEW_SECONDS} ثانية ثم أكِّد أو ارفض. لا يُحفَظ
        شيء على جهازك.
      </p>
      <p className="count">بحاجة إلى تأكيد: {unverified.length}</p>

      <ul className="verify-list">
        {unverified.map((s) => (
          <li key={s.surah} className="verify-row">
            <button
              className="mini preview"
              onClick={() => void preview(s)}
              aria-label={playing === s.surah ? 'إيقاف' : 'سماع'}
            >
              {playing === s.surah ? <Pause size={18} /> : <Play size={18} />}
            </button>

            <span className="verify-names">
              <span className="name-ar">سُورَةُ {s.name}</span>
              <span className="name-plain">
                {s.nameEn} · {s.translation}
              </span>
              {failed[s.surah] && <span className="verify-err">{failed[s.surah]}</span>}
            </span>

            <span className="verify-actions">
              <button className="btn tiny ok" onClick={() => decide(s, 'ok')}>
                صحيح
              </button>
              <button className="btn tiny no" onClick={() => decide(s, 'wrong')}>
                خطأ
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
