import { useCallback, useRef, useState } from 'react'
import type { Strings } from '../i18n'
import type { Reciter } from '../catalog/types'

/** How a photograph sits inside a frame. Percentages, as CSS wants them. */
export type Frame = { zoom: number; x: number; y: number }

/** The two places a reciter's photograph appears, framed independently. */
export type Surface = 'player' | 'card'

export const SURFACES: Surface[] = ['player', 'card']

/** `reciterId:surface` to its framing. */
export type Frames = Record<string, Frame>

export const frameKey = (reciterId: string, surface: Surface) =>
  `${reciterId}:${surface}`

/**
 * Where each photograph starts.
 *
 * Al-Dosari's is the one still shipping as an uncropped original, with his
 * head high in the frame, so it needs zooming and lifting. The rest are
 * cropped square on the face before they ship, and want no adjustment at all.
 */
export const defaultFrame = (reciterId: string): Frame =>
  reciterId === 'dosari' ? { zoom: 160, x: 63, y: 13 } : { zoom: 100, x: 50, y: 50 }

export const frameOf = (frames: Frames, reciterId: string, surface: Surface): Frame =>
  frames[frameKey(reciterId, surface)] ?? defaultFrame(reciterId)

/** The CSS custom properties a framed element needs. */
export const frameStyle = (f: Frame) =>
  ({
    ['--face-zoom' as string]: `${f.zoom}%`,
    ['--face-x' as string]: `${f.x}%`,
    ['--face-y' as string]: `${f.y}%`,
  }) as React.CSSProperties

type Props = {
  t: Strings
  reciters: Reciter[]
  frames: Frames
  onChange: (key: string, frame: Frame) => void
  onReset: (key: string) => void
}

const BASE = import.meta.env?.BASE_URL ?? '/'
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/**
 * Framing a reciter's photograph.
 *
 * The portraits arrive at whatever crop their source had and the face is
 * never in the same place twice. Rather than hand-tuning offsets in a
 * stylesheet for each one, this puts the crop where it belongs: drag the
 * picture to move it, pull the slider to zoom, and the preview is exactly
 * what the app will show.
 *
 * The two places a photo appears are framed separately, because they are
 * different shapes at different sizes: the round medallion in the open
 * player can take a tighter crop than the card in the dock, which is wider
 * and shows more of the shoulders.
 */
export function PhotoFramer({ t, reciters, frames, onChange, onReset }: Props) {
  const withPhotos = reciters.filter((r) => r.photo)
  const [who, setWho] = useState<string | null>(withPhotos[0]?.id ?? null)
  const [surface, setSurface] = useState<Surface>('player')
  const drag = useRef<{ x: number; y: number; box: number } | null>(null)

  const current = withPhotos.find((r) => r.id === who) ?? withPhotos[0]
  const key = current ? frameKey(current.id, surface) : ''
  const frame = current ? frameOf(frames, current.id, surface) : defaultFrame('')

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      box: e.currentTarget.getBoundingClientRect().width || 1,
    }
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current
      if (!d || !current) return
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      d.x = e.clientX
      d.y = e.clientY
      // A background position of p% puts the image's p point at the frame's p
      // point, so the picture travels *against* the number: dragging right has
      // to lower x, or the photo would run away from the finger.
      const step = 70 / d.box
      onChange(key, {
        ...frame,
        x: clamp(frame.x - dx * step, 0, 100),
        y: clamp(frame.y - dy * step, 0, 100),
      })
    },
    [current, frame, key, onChange],
  )

  const endDrag = useCallback(() => {
    drag.current = null
  }, [])

  if (!current) return null

  return (
    <div className="framer">
      <p className="lang-label">{t.photoFraming}</p>

      <div className="framer-who">
        {withPhotos.map((r) => (
          <button
            key={r.id}
            className={`btn${r.id === current.id ? ' on' : ''}`}
            onClick={() => setWho(r.id)}
          >
            {r.name}
          </button>
        ))}
      </div>

      <div className="seg framer-surface" role="group" aria-label={t.photoFraming}>
        {SURFACES.map((s) => (
          <button key={s} aria-pressed={surface === s} onClick={() => setSurface(s)}>
            {t.surfaceName[s]}
          </button>
        ))}
      </div>

      <div className="framer-stage">
        {/* The preview is the frame itself, in its real shape: a circle for
            the player's medallion, a rounded card for the dock. */}
        <div
          className={`framer-preview is-${surface}`}
          style={{
            backgroundImage: `url('${BASE}${current.photo}')`,
            backgroundSize: `${frame.zoom}% auto`,
            backgroundPosition: `${frame.x}% ${frame.y}%`,
          }}
          role="application"
          aria-label={t.dragToPosition}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        <div className="framer-controls">
          <label className="framer-zoom">
            <span>{t.zoom}</span>
            <input
              type="range"
              min={100}
              max={300}
              step={2}
              value={Math.round(frame.zoom)}
              onChange={(e) => onChange(key, { ...frame, zoom: Number(e.target.value) })}
            />
          </label>
          <p className="hifz-note">{t.dragToPosition}</p>
          <button className="btn" onClick={() => onReset(key)}>
            {t.resetFraming}
          </button>
        </div>
      </div>
    </div>
  )
}
