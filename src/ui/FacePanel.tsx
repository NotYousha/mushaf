import { useRef, useState } from 'react'
import type { Strings, Lang } from '../i18n'
import { inScript } from '../i18n/script'
import { allImams, PLACES, type Imam, type Place } from '../catalog/mosques'
import { Saved } from './Icons'

type Props = {
  t: Strings
  lang: Lang
  base: string
  /** Portraits the listener has added, imam id to object URL. */
  faces: Map<string, string>
  onPick: (imamId: string, file: File) => Promise<void>
  onRemove: (imamId: string) => Promise<void>
}

/**
 * Portraits for the imams, supplied by the listener.
 *
 * A Taraweeh year is recited by a dozen different men and the app ships a
 * photograph for four of them. Rather than bundle pictures of people we have
 * no rights to, this lets the listener add their own; they are stored on the
 * device and never leave it.
 *
 * Grouped by mosque and ordered by how much of the Quran each actually
 * recites, so the faces a listener meets most often are the ones asked for
 * first rather than buried under men who led one night in 1418.
 */
export function FacePanel({ t, lang, base, faces, onPick, onRemove }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const inputs = useRef(new Map<string, HTMLInputElement | null>())

  const roster = allImams()
  const groups: { place: Place; label: string; imams: Imam[] }[] = PLACES.map((m) => ({
    place: m.place,
    label: inScript(lang, m.ar, m.en),
    imams: roster.filter((i) => i.serves.includes(m.place)),
  })).filter((g) => g.imams.length)

  const pick = async (imam: Imam, file: File | undefined) => {
    if (!file) return
    setBusy(imam.id)
    setFailed(null)
    try {
      await onPick(imam.id, file)
    } catch {
      setFailed(imam.id)
    } finally {
      setBusy(null)
      // Clearing it lets the same file be chosen again after a failure.
      const el = inputs.current.get(imam.id)
      if (el) el.value = ''
    }
  }

  return (
    <section className="faces">
      <h2 style={{ marginTop: '1.6rem' }}>{t.photoFraming}</h2>
      <p className="faces-intro">{t.facesIntro}</p>

      {groups.map((g) => (
        <div key={g.place} className="faces-group">
          <h3>{g.label}</h3>
          <ul className="faces-list">
            {g.imams.map((imam) => {
              // The listener's own picture wins over a shipped one.
              const mine = faces.get(imam.id)
              const src = mine ?? (imam.photo ? `${base}${imam.photo}` : null)
              return (
                <li key={imam.id} className="face-row">
                  <span
                    className={`face-thumb${src ? '' : ' is-empty'}`}
                    aria-hidden="true"
                    data-reciter={mine ? '' : imam.id}
                    style={src ? { backgroundImage: `url('${src}')` } : undefined}
                  />
                  <span className="face-name">
                    {inScript(lang, imam.name, imam.nameEn)}
                    {failed === imam.id && <span className="face-err">{t.facePickFailed}</span>}
                  </span>

                  <span className="face-actions">
                    {mine && (
                      <span className="face-has" aria-hidden="true">
                        <Saved size={16} />
                      </span>
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
                        onClick={() => void onRemove(imam.id)}
                      >
                        {t.faceRemove}
                      </button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
