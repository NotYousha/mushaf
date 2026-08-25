import { useRef, useState } from 'react'
import type { Strings, Lang } from '../i18n'
import { inScript, digits } from '../i18n/script'
import { allImams, PLACES, type Imam, type Place } from '../catalog/mosques'
import {
  DEFAULT_FRAMING,
  SURFACES,
  type Face,
  type Framing,
  type Surface,
} from '../db/faces'
import { Saved } from './Icons'

type Props = {
  t: Strings
  lang: Lang
  base: string
  /** Portraits the listener has added, imam id to picture and framing. */
  faces: Map<string, Face>
  onPick: (imamId: string, file: File) => Promise<void>
  onFrame: (imamId: string, surface: Surface, framing: Framing) => Promise<void>
  onRemove: (imamId: string) => Promise<void>
  onExport: () => Promise<void>
  onClearAll: () => Promise<number>
  onImport: (file: File) => Promise<number>
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * Portraits for the imams, supplied by the listener.
 *
 * A Taraweeh year is recited by a dozen different men and the app ships a
 * photograph for four of them. Rather than bundle pictures of people we have
 * no rights to, this takes the listener's own; they stay on the device.
 *
 * The picture is stored whole and framed afterwards. A face is rarely dead
 * centre in a photograph, and a crop chosen on import cannot be undone — so
 * the crop stays adjustable: drag the preview to move, the slider to zoom.
 */
export function FacePanel({
  t,
  lang,
  base,
  faces,
  onPick,
  onFrame,
  onRemove,
  onExport,
  onImport,
  onClearAll,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null)
  /** Which row is open for framing, and its live values while dragging. */
  const [editing, setEditing] = useState<string | null>(null)
  /** Which surface is being framed: the player's circle or the dock's card. */
  const [surface, setSurface] = useState<Surface>('player')
  const [draft, setDraft] = useState<Framing>(DEFAULT_FRAMING)
  const inputs = useRef(new Map<string, HTMLInputElement | null>())
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null)
  const transferInput = useRef<HTMLInputElement | null>(null)
  const [moved, setMoved] = useState<string | null>(null)

  const roster = allImams()
  const groups = PLACES.map((m) => ({
    place: m.place as Place,
    label: inScript(lang, m.ar, m.en),
    imams: roster.filter((i) => i.serves.includes(m.place)),
  })).filter((g) => g.imams.length)

  const pick = async (imam: Imam, file: File | undefined) => {
    if (!file) return
    setBusy(imam.id)
    setFailed(null)
    try {
      await onPick(imam.id, file)
      // Straight into framing: a photo almost always wants a nudge, and
      // finding the control afterwards is a step nobody should have to guess.
      setEditing(imam.id)
      setSurface('player')
      setDraft({ ...DEFAULT_FRAMING })
    } catch (e) {
      setFailed({
        id: imam.id,
        message: e instanceof Error ? e.message : t.facePickFailed,
      })
    } finally {
      setBusy(null)
      // Clearing it lets the same file be chosen again after a failure.
      const el = inputs.current.get(imam.id)
      if (el) el.value = ''
    }
  }

  const openFraming = (id: string, face: Face, next: Surface = 'player') => {
    setEditing(id)
    setSurface(next)
    setDraft({ ...face[next] })
  }

  /**
   * Dragging moves the picture inside the circle.
   *
   * Pointer events rather than mouse or touch, so a finger, a trackpad and a
   * stylus all behave the same, and the pointer is captured so a fast drag
   * that leaves the circle keeps working instead of stopping dead.
   */
  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, fx: draft.x, fy: draft.y }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const box = e.currentTarget.getBoundingClientRect()
    // Moving the picture right means showing more of its left side, so the
    // background position runs opposite to the finger.
    const nx = clamp(d.fx - ((e.clientX - d.x) / box.width) * 100, 0, 100)
    const ny = clamp(d.fy - ((e.clientY - d.y) / box.height) * 100, 0, 100)
    setDraft((p) => ({ ...p, x: nx, y: ny }))
  }

  const endDrag = (id: string) => {
    if (!drag.current) return
    drag.current = null
    void onFrame(id, surface, draft)
  }

  return (
    <section className="faces">
      <h2 style={{ marginTop: '1.6rem' }}>{t.photoFraming}</h2>
      <p className="faces-intro">{t.facesIntro}</p>

      {/* Browser storage is per device: a photograph added on a phone is on
          that phone and nowhere else. This is the way across. */}
      <div className="faces-transfer">
        <button
          type="button"
          className="face-add"
          disabled={!faces.size}
          onClick={() => void onExport()}
        >
          {t.facesExport}
        </button>
        <label className="face-add">
          {t.facesImport}
          <input
            ref={transferInput}
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              setMoved(null)
              void onImport(f)
                .then((n) => setMoved(t.facesImported(n)))
                .catch((err) => setMoved(err instanceof Error ? err.message : String(err)))
                .finally(() => {
                  if (transferInput.current) transferInput.current.value = ''
                })
            }}
          />
        </label>
        {/* Only worth offering while there is something overriding the
            bundled set. A photo added by hand wins over the one that ships,
            which is right until the app has its own — and then a picture on
            the wrong imam keeps showing under a correct name. */}
        {faces.size > 0 && (
          <button
            type="button"
            className="face-remove"
            onClick={() => {
              setMoved(null)
              void onClearAll().then((n) => setMoved(t.facesCleared(n)))
            }}
          >
            {t.facesUseBundled}
          </button>
        )}
        {moved && <span className="faces-moved">{moved}</span>}
      </div>

      {groups.map((g) => (
        <div key={g.place} className="faces-group">
          <h3>{g.label}</h3>
          <ul className="faces-list">
            {g.imams.map((imam) => {
              // The listener's own picture wins over a shipped one.
              const mine = faces.get(imam.id)
              const src = mine?.url ?? (imam.photo ? `${base}${imam.photo}` : null)
              const open = editing === imam.id && !!mine
              // The row's thumbnail previews the circle, so it follows the
                  // player framing unless that is the one being dragged.
                  const frame =
                    open && surface === 'player' ? draft : (mine?.player ?? DEFAULT_FRAMING)
              return (
                <li key={imam.id} className={`face-row${open ? ' is-editing' : ''}`}>
                  <span
                    className={`face-thumb${src ? '' : ' is-empty'}`}
                    aria-hidden="true"
                    data-reciter={mine ? '' : imam.id}
                    style={
                      src
                        ? {
                            backgroundImage: `url('${src}')`,
                            ...(mine
                              ? {
                                  backgroundSize: `${frame.zoom}% auto`,
                                  backgroundPosition: `${frame.x}% ${frame.y}%`,
                                }
                              : {}),
                          }
                        : undefined
                    }
                  />
                  <span className="face-name">
                    {inScript(lang, imam.name, imam.nameEn)}
                    {failed?.id === imam.id && (
                      <span className="face-err">{failed.message}</span>
                    )}
                  </span>

                  <span className="face-actions">
                    {mine && (
                      <>
                        <span className="face-has" aria-hidden="true">
                          <Saved size={16} />
                        </span>
                        <button
                          type="button"
                          className="face-frame-btn"
                          aria-expanded={open}
                          onClick={() => (open ? setEditing(null) : openFraming(imam.id, mine))}
                        >
                          {open ? t.faceDone : t.faceAdjust}
                        </button>
                      </>
                    )}
                    <label className="face-add">
                      {busy === imam.id ? '…' : mine ? t.faceReplace : t.faceAdd}
                      <input
                        ref={(el) => {
                          inputs.current.set(imam.id, el)
                        }}
                        type="file"
                        accept="image/*"
                        onChange={(e) => void pick(imam, e.target.files?.[0])}
                        aria-label={`${t.faceAdd} — ${inScript(lang, imam.name, imam.nameEn)}`}
                      />
                    </label>
                    {mine && (
                      <button
                        type="button"
                        className="face-remove"
                        onClick={() => {
                          setEditing(null)
                          void onRemove(imam.id)
                        }}
                      >
                        {t.faceRemove}
                      </button>
                    )}
                  </span>

                  {open && mine && (
                    <div className="face-editor">
                      <div
                        className={`face-stage is-${surface}`}
                        role="img"
                        aria-label={t.dragToPosition}
                        style={{
                          backgroundImage: `url('${mine.url}')`,
                          backgroundSize: `${draft.zoom}% auto`,
                          backgroundPosition: `${draft.x}% ${draft.y}%`,
                        }}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={() => endDrag(imam.id)}
                        onPointerCancel={() => endDrag(imam.id)}
                      />
                      <div className="face-controls">
                        {/* Each surface is framed on its own: a crop that
                            suits the player's circle rarely suits the dock's
                            small square. */}
                        <div className="face-surfaces" role="tablist">
                          {SURFACES.map((sf) => (
                            <button
                              key={sf}
                              type="button"
                              role="tab"
                              aria-selected={surface === sf}
                              className={`face-surface${surface === sf ? ' is-on' : ''}`}
                              onClick={() => openFraming(imam.id, mine, sf)}
                            >
                              {t.surfaceName[sf]}
                            </button>
                          ))}
                        </div>
                        <label className="face-zoom">
                          {t.zoom} {digits(lang, Math.round(draft.zoom))}%
                          <input
                            type="range"
                            min={100}
                            max={320}
                            step={1}
                            value={draft.zoom}
                            onChange={(e) =>
                              setDraft((p) => ({ ...p, zoom: Number(e.target.value) }))
                            }
                            onPointerUp={() => void onFrame(imam.id, surface, draft)}
                            onKeyUp={() => void onFrame(imam.id, surface, draft)}
                          />
                        </label>
                        <p className="face-hint">{t.dragToPosition}</p>
                        <button
                          type="button"
                          className="face-reset"
                          onClick={() => {
                            setDraft({ ...DEFAULT_FRAMING })
                            void onFrame(imam.id, surface, { ...DEFAULT_FRAMING })
                          }}
                        >
                          {t.resetFraming}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
