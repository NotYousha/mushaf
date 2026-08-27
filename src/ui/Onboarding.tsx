import { useState } from 'react'
import type { Strings, Lang } from '../i18n'
import { LANGS, stringsFor, dirOf } from '../i18n'
import { inScript } from '../i18n/script'
import { THEMES, type ThemeId, type Mode, resolveMode } from './theming'
import { editions, editionName, type EditionChoice } from './editions'

type Props = {
  /** What the app has decided to start in — the phone's language, or English. */
  lang: Lang
  theme: ThemeId
  mode: Mode
  edition: string
  /**
   * Applied as it is chosen, not on the last step.
   *
   * Choosing a language and then reading two more screens in the old one would
   * be its own small insult, and the whole point of the theme step is seeing
   * the theme. So each of these takes effect immediately and the flow simply
   * asks what to do next.
   */
  onLang: (l: Lang) => void
  onTheme: (t: ThemeId) => void
  onMode: (m: Mode) => void
  onEdition: (id: string) => void
  onDone: () => void
}

/**
 * The three questions a new install asks, once.
 *
 * Language first, because every screen after it — including the rest of this
 * flow — is written in whatever it answers. Then light or dark, because that is
 * the choice people notice within a second of opening an app at night. Then
 * which mushaf, which is last because it is the one a new reader is least
 * likely to have an opinion about and the one that changes least.
 *
 * Nothing here can be got wrong permanently: every answer is a setting that
 * lives in Settings afterwards, and the flow itself can be reopened from there.
 * So there is no confirmation, no summary screen, and no way to be stuck — each
 * step has a default already applied and Next simply moves on.
 */
export function Onboarding({
  lang,
  theme,
  mode,
  edition,
  onLang,
  onTheme,
  onMode,
  onEdition,
  onDone,
}: Props) {
  const [step, setStep] = useState(0)
  // The flow re-reads its own strings, so the language step changes the words
  // under the reader's finger the moment they pick.
  const t: Strings = stringsFor(lang)
  const list: EditionChoice[] = editions()
  const last = 2

  const steps = [
    { title: t.obLangTitle, sub: t.obLangSub },
    { title: t.obThemeTitle, sub: t.obThemeSub },
    { title: t.obMushafTitle, sub: t.obMushafSub },
  ]

  return (
    <div className="ob" dir={dirOf(lang)} role="dialog" aria-modal="true" aria-label={t.obWelcome}>
      <div className="ob-sheet">
        <header className="ob-head">
          <p className="ob-kicker">{t.obWelcome}</p>
          <h1 className="ob-title">{steps[step].title}</h1>
          <p className="ob-sub">{steps[step].sub}</p>
        </header>

        <div className="ob-body">
          {step === 0 && (
            <ul className="ob-options">
              {LANGS.map((l) => (
                <li key={l.code}>
                  <button
                    type="button"
                    className={`ob-option${l.code === lang ? ' is-on' : ''}`}
                    aria-pressed={l.code === lang}
                    // Each language names itself, in its own script: somebody
                    // looking for their language is looking for that word, not
                    // for its English name.
                    lang={l.code}
                    dir={l.dir}
                    onClick={() => onLang(l.code)}
                  >
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {step === 1 && (
            <>
              <ul className="ob-modes">
                {(
                  [
                    ['light', t.obLight],
                    ['dark', t.obDark],
                    ['system', t.obSystem],
                  ] as [Mode, string][]
                ).map(([m, label]) => (
                  <li key={m}>
                    <button
                      type="button"
                      className={`ob-mode${m === mode ? ' is-on' : ''}`}
                      aria-pressed={m === mode}
                      onClick={() => onMode(m)}
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>

              <p className="ob-label">{t.obPalette}</p>
              <ul className="ob-swatches">
                {THEMES.map((th) => {
                  const shade = resolveMode(mode)
                  const [ground, accent, ink] = th.swatch[shade]
                  return (
                    <li key={th.id}>
                      <button
                        type="button"
                        className={`ob-swatch${th.id === theme ? ' is-on' : ''}`}
                        aria-pressed={th.id === theme}
                        onClick={() => onTheme(th.id)}
                      >
                        {/* The palette shown in the mode it will actually be
                            read in, so the choice is not a guess. */}
                        <span
                          className="ob-chip"
                          aria-hidden="true"
                          style={{ background: ground, borderColor: accent }}
                        >
                          <span style={{ background: accent }} />
                          <span style={{ background: ink }} />
                        </span>
                        <span className="ob-swatch-name">
                          {inScript(lang, th.ar, th.latin)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {step === 2 && (
            <ul className="ob-options">
              {list.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`ob-option ob-tall${e.id === edition ? ' is-on' : ''}`}
                    aria-pressed={e.id === edition}
                    onClick={() => onEdition(e.id)}
                  >
                    <span className="ob-option-name">{editionName(e, lang)}</span>
                    <span className="ob-option-note">{e.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="ob-foot">
          {/* Dots rather than "2 of 3": three is few enough to see, and it
              saves a string in five languages that says nothing. */}
          <span className="ob-dots" aria-hidden="true">
            {steps.map((_, i) => (
              <span key={i} className={i === step ? 'is-on' : undefined} />
            ))}
          </span>

          <span className="ob-actions">
            {step > 0 && (
              <button type="button" className="ob-back" onClick={() => setStep(step - 1)}>
                {t.obBack}
              </button>
            )}
            <button
              type="button"
              className="ob-next"
              onClick={() => (step === last ? onDone() : setStep(step + 1))}
            >
              {step === last ? t.obDone : t.obNext}
            </button>
          </span>
        </footer>
      </div>
    </div>
  )
}
