import type { Strings, Lang } from '../i18n'
import { THEMES, resolveMode, type Mode, type ThemeId } from './theming'

type Props = {
  t: Strings
  lang: Lang
  theme: ThemeId
  mode: Mode
  onTheme: (id: ThemeId) => void
  onMode: (mode: Mode) => void
}

const MODES: Mode[] = ['light', 'dark', 'system']

/**
 * Choosing a theme.
 *
 * Every card is painted in its own palette rather than described, because
 * nobody can tell what "Zellij" looks like from the word. The swatch follows
 * whichever of light or dark is actually in force, so what you see on the
 * card is what the app is about to become.
 */
export function ThemePicker({ t, lang, theme, mode, onTheme, onMode }: Props) {
  const resolved = resolveMode(mode)
  const arabicScript = lang === 'ar' || lang === 'ur'

  return (
    <div className="theming">
      <p className="lang-label">{t.appearance}</p>
      <div className="seg mode-seg" role="group" aria-label={t.appearance}>
        {MODES.map((m) => (
          <button key={m} aria-pressed={mode === m} onClick={() => onMode(m)}>
            {t.modeName[m]}
          </button>
        ))}
      </div>

      <p className="lang-label theme-label">{t.theme}</p>
      <div className="theme-grid" role="radiogroup" aria-label={t.theme}>
        {THEMES.map((th) => {
          const [ground, accent, ink, line] = th.swatch[resolved]
          const active = th.id === theme
          return (
            <button
              key={th.id}
              role="radio"
              aria-checked={active}
              className={`theme-card${active ? ' is-on' : ''}`}
              onClick={() => onTheme(th.id)}
              // Painted in its own colours: the card is the preview.
              style={{
                ['--sw-ground' as string]: ground,
                ['--sw-accent' as string]: accent,
                ['--sw-ink' as string]: ink,
                ['--sw-line' as string]: line,
              }}
            >
              <span className="theme-swatch" aria-hidden="true">
                <span className="sw-accent" />
                <span className="sw-ink" />
              </span>
              <span className="theme-names">
                <span className="theme-name">{arabicScript ? th.ar : th.latin}</span>
                <span className="theme-of">{arabicScript ? th.ofAr : th.ofEn}</span>
              </span>
              {th.prefers === 'dark' && (
                <span className="theme-hint">{t.bestAtNight}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
