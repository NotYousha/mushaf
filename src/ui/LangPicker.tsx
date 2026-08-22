import { LANGS, type Lang } from '../i18n'

type Props = {
  lang: Lang
  onChange: (lang: Lang) => void
  label: string
}

/**
 * The interface language.
 *
 * A scrolling strip rather than a dropdown: the list will keep growing, and a
 * strip shows several options at once without hiding the current one behind a
 * tap. Each language is labelled in its own script, since a list of English
 * names is no use to the person who most needs the picker.
 */
export function LangPicker({ lang, onChange, label }: Props) {
  return (
    <div className="lang-picker">
      <span className="lang-label">{label}</span>
      <div className="lang-strip" role="tablist" aria-label={label}>
        {LANGS.map((l) => (
          <button
            key={l.code}
            role="tab"
            aria-selected={l.code === lang}
            className="chip lang-chip"
            lang={l.code}
            dir={l.dir}
            onClick={() => onChange(l.code)}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  )
}
