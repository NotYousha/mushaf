import { useCallback, useEffect, useRef, useState } from 'react'
import type { Strings } from '../i18n'
import { buildDrill, loadForks, rankForks, type Branch, type Drill } from '../hifz/forks'
import { hasTimings } from '../mushaf/data'
import { stumblesFor } from '../db/practice'

type Props = {
  t: Strings
  reciterId: string
  /**
   * Play one surah between two moments and resolve when it reaches the end.
   * Rejects or resolves early if playback could not start.
   */
  playRange: (surah: number, from: number, to: number) => Promise<void>
  stop: () => void
}

type Stage = 'idle' | 'leading' | 'waiting' | 'revealed'

export function ForkDrill({ t, reciterId, playRange, stop }: Props) {
  const [drill, setDrill] = useState<Drill | null>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Which branch was played as the lead-in this round. */
  const [asked, setAsked] = useState(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const nextDrill = useCallback(async () => {
    setBusy(true)
    setError(null)
    stop()
    try {
      const forks = await loadForks()
      // Stumbles the reader has recorded steer the choice, so the drill is
      // aimed at mistakes actually made rather than at trivia.
      const keys: string[] = []
      for (const f of forks.slice(0, 60)) {
        for (const p of f.at) {
          const marks = await stumblesFor(p.s)
          for (const m of marks) keys.push(m.key)
          break
        }
        if (keys.length > 40) break
      }
      const ranked = rankForks(forks, keys)
      // A little randomness among the strongest candidates, so the same fork
      // does not come up every single time.
      const pool = ranked.slice(0, 40)
      for (let i = 0; i < 12; i++) {
        const pick = pool[Math.floor(Math.random() * pool.length)]
        const d = await buildDrill(reciterId, pick)
        if (d) {
          if (!alive.current) return
          setDrill(d)
          setAsked(Math.floor(Math.random() * d.branches.length))
          setStage('idle')
          setBusy(false)
          return
        }
      }
      if (alive.current) setError(t.forkNeedsTimings)
    } catch {
      if (alive.current) setError(t.forkFailed)
    } finally {
      if (alive.current) setBusy(false)
    }
  }, [reciterId, stop, t])

  useEffect(() => {
    if (hasTimings(reciterId)) void nextDrill()
    else setError(t.forkNeedsTimings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reciterId])

  /** Play the shared phrase and cut at the split. */
  const runLead = async (b: Branch) => {
    setStage('leading')
    await playRange(b.at.s, b.from, b.cut)
    if (!alive.current) return
    // Silence is the drill: the next word has to come from you.
    setStage('waiting')
  }

  /** Both futures of the same past, one after the other. */
  const runReveal = async () => {
    if (!drill) return
    setStage('revealed')
    for (const b of drill.branches) {
      if (!alive.current) return
      await playRange(b.at.s, b.cut, b.after)
    }
  }

  if (error) {
    return (
      <div className="fork">
        <p className="empty small">{error}</p>
        {hasTimings(reciterId) && (
          <button className="btn" onClick={() => void nextDrill()}>
            {t.forkAgain}
          </button>
        )}
      </div>
    )
  }

  if (busy || !drill) return <p className="empty small">{t.loading}</p>

  const lead = drill.branches[asked] ?? drill.branches[0]

  return (
    <div className="fork">
      <p className="hifz-note">{t.forkNote}</p>

      <div className="fork-shared">
        <span className="fork-count">{t.forkWords(drill.fork.n)}</span>
        <p className="fork-text">{drill.fork.text}</p>
      </div>

      {stage === 'idle' && (
        <button className="btn wide" onClick={() => void runLead(lead)}>
          {t.forkPlay}
        </button>
      )}

      {stage === 'leading' && <p className="fork-cue">{t.forkListening}</p>}

      {stage === 'waiting' && (
        <>
          {/* The whole point of the drill lives in this pause. */}
          <p className="fork-cue is-yours">{t.forkYourWord}</p>
          <button className="btn wide" onClick={() => void runReveal()}>
            {t.forkReveal}
          </button>
        </>
      )}

      {stage === 'revealed' && (
        <ul className="fork-branches">
          {drill.branches.map((b, i) => (
            <li key={`${b.at.s}:${b.at.a}:${b.at.w}`} className={i === asked ? 'was-asked' : ''}>
              <span className="fork-next">{b.at.next ?? '—'}</span>
              <span className="fork-where">{t.ayahRef(b.at.s, b.at.a)}</span>
              <button className="btn tiny" onClick={() => void playRange(b.at.s, b.cut, b.after)}>
                {t.forkHear}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="fork-acts">
        {stage !== 'idle' && (
          <button className="btn" onClick={() => void runLead(lead)}>
            {t.forkReplay}
          </button>
        )}
        <button className="btn" onClick={() => void nextDrill()}>
          {t.forkNext}
        </button>
      </div>
    </div>
  )
}
