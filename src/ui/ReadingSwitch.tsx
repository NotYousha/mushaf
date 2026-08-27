import type { Strings } from '../i18n'
import { Library } from './Icons'

type Props = {
  t: Strings
  reading: 'mushaf' | 'translation'
  onChange: (reading: 'mushaf' | 'translation') => void
  onOpenIndex: () => void
}

/**
 * Mushaf or translation, and the way into the index.
 *
 * Three controls in a row because they are the only three things you can do
 * to the Quran tab that are not reading it: change how the text is set,
 * or go somewhere else in it.
 *
 * The index button is here as well as on the page's own bar. That looks like
 * a duplicate and is not: the page's bar disappears in full screen, and the
 * translation view has no bar at all.
 */
export function ReadingSwitch({ t, reading, onChange, onOpenIndex }: Props) {
  return (
    <div className="reading-switch">
      <div className="seg" role="tablist" aria-label={t.tabText}>
        <button
          type="button"
          role="tab"
          aria-selected={reading === 'mushaf'}
          onClick={() => onChange('mushaf')}
        >
          {t.mushafTab}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={reading === 'translation'}
          onClick={() => onChange('translation')}
        >
          {t.translationTab}
        </button>
      </div>

      <button
        type="button"
        className="btn"
        aria-label={t.mushafIndex}
        onClick={onOpenIndex}
      >
        <Library size={18} />
      </button>
    </div>
  )
}
