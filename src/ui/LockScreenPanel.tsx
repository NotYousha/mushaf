import { useEffect, useState } from 'react'
import type { Strings } from '../i18n'
import { remoteLog, registeredActions, type RemoteEvent } from '../player/mediaSession'

type Props = {
  t: Strings
  /** The element actually playing, which is not in the document. */
  el: HTMLAudioElement | null
}

/**
 * What the lock screen is really doing, readable from the phone itself.
 *
 * None of this can be seen from a laptop. When a scrubber will not move there
 * are two possibilities with opposite fixes — the system never sent the
 * command, or it sent one we mishandled — and no way to tell them apart from
 * here. So the app writes down what arrives and shows it, and a phone can
 * answer the question in one go instead of another round of guessing.
 *
 * English and unlocalised on purpose: the values are raw browser state, and
 * translating the labels around them would suggest they mean more than they
 * do. It is the one screen in the app written for the person fixing it.
 */
export function LockScreenPanel({ t, el }: Props) {
  const [events, setEvents] = useState<RemoteEvent[]>([])
  const [state, setState] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const tick = () => {
      setEvents(remoteLog())
      const s = (navigator as unknown as { mediaSession?: MediaSession }).mediaSession
      const ranges: string[] = []
      if (el) {
        for (let i = 0; i < el.seekable.length; i++) {
          ranges.push(`${el.seekable.start(i).toFixed(0)}–${el.seekable.end(i).toFixed(0)}`)
        }
      }
      setState({
        mediaSession: s ? 'yes' : 'no',
        setPositionState: s?.setPositionState ? 'yes' : 'no',
        playbackState: s?.playbackState ?? '—',
        handlers: registeredActions().join(', ') || '—',
        source: !el?.src ? '—' : el.src.startsWith('blob:') ? 'saved copy' : 'streaming',
        duration: el ? fmt(el.duration) : '—',
        currentTime: el ? fmt(el.currentTime) : '—',
        // An empty seekable range is the state in which the system refuses to
        // make the bar draggable at all, so it is the first thing to read.
        seekable: ranges.length ? ranges.join(' ') : 'none',
        readyState: el ? String(el.readyState) : '—',
        paused: el ? String(el.paused) : '—',
        rate: el ? String(el.playbackRate) : '—',
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [el])

  const report = [
    ...Object.entries(state).map(([k, v]) => `${k}: ${v}`),
    '',
    ...events.map(
      (e) =>
        `${(e.at / 1000).toFixed(1)}s ${e.action}` +
        (e.seekTime === undefined ? '' : ` → ${e.seekTime.toFixed(1)}s`) +
        (e.fastSeek ? ' (dragging)' : ''),
    ),
  ].join('\n')

  return (
    <section className="diag">
      <h2 style={{ marginTop: '1.6rem' }}>{t.lockScreen}</h2>
      <p className="diag-intro">{t.lockScreenIntro}</p>

      <dl className="diag-grid">
        {Object.entries(state).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <h3 className="diag-h">Commands received</h3>
      {events.length === 0 ? (
        <p className="diag-empty">{t.lockScreenNone}</p>
      ) : (
        <ol className="diag-log">
          {events
            .slice()
            .reverse()
            .map((e, i) => (
              <li key={i}>
                <span className="diag-at">{(e.at / 1000).toFixed(1)}s</span>
                <span className="diag-act">{e.action}</span>
                {e.seekTime !== undefined && (
                  <span className="diag-to">→ {e.seekTime.toFixed(1)}s</span>
                )}
                {e.fastSeek && <span className="diag-flag">dragging</span>}
              </li>
            ))}
        </ol>
      )}

      <button
        type="button"
        className="diag-copy"
        onClick={() => {
          void navigator.clipboard?.writeText(report).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }}
      >
        {copied ? t.copied : t.copyReport}
      </button>
    </section>
  )
}

const fmt = (n: number) =>
  !Number.isFinite(n) ? String(n) : `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`
