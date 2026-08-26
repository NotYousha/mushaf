import type { Strings } from '../i18n'
import { SURFACES, type SurfaceChoice } from '../surface'

type Props = {
  t: Strings
  choice: SurfaceChoice
  /** What `auto` currently lands on, so the guess is visible. */
  resolved: SurfaceChoice
  onChoose: (c: SurfaceChoice) => void
}

/**
 * Forcing a surface.
 *
 * Not a debugging affordance, though it serves as one. A large tablet and a
 * television are indistinguishable through a media query — an iPad Pro in
 * landscape is 1366 CSS px with a coarse pointer and no hover, which is exactly
 * what a television looks like — so auto-detection is a good guess rather than
 * an answer, and this is where a wrong guess gets corrected. It is also the
 * only way anyone can see the television layout without a television.
 *
 * `native` is offered by no button. It is not a preference, it is a fact about
 * whether a wrapper declared itself, and choosing it in a browser would hide
 * the dock and draw nothing in its place.
 */
export function SurfacePicker({ t, choice, resolved, onChoose }: Props) {
  const options: SurfaceChoice[] = ['auto', ...SURFACES.filter((s) => s !== 'native')]

  return (
    <section className="screen-picker">
      <h3>{t.screen}</h3>
      <p className="screen-note">{t.screenNote}</p>
      <div className="screen-options" role="radiogroup" aria-label={t.screen}>
        {options.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={choice === id}
            className="screen-option"
            onClick={() => onChoose(id)}
          >
            <span>{t.screenNames[id]}</span>
            {id === 'auto' && choice === 'auto' && (
              <span className="screen-resolved">{t.screenNames[resolved]}</span>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}
