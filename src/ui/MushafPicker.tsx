import { useState } from 'react'
import type { Lang, Strings } from '../i18n'
import { isArabicScript } from '../i18n/script'
import {
  EDITIONS,
  FAMILIES,
  UNAVAILABLE,
  type Edition,
  type EditionFamily,
} from '../mushaf/editions'
import { Check } from './Icons'

type Props = {
  t: Strings
  lang: Lang
  chosen: string
  onChoose: (id: string) => void
}

/**
 * Choose Mushaf.
 *
 * Three tabs and a card each, as every reader of a Quran app expects, because
 * this is one of the few screens where matching what people already know is
 * worth more than being original.
 *
 * What is not copied is the silence. Other apps list a dozen mushafs and let
 * you find out for yourself that the one you picked is a scan — no word
 * following, no search, nothing read aloud. Every card here says what its
 * edition can do, and the tabs with nothing in them say what is actually
 * holding them up rather than being hidden.
 */
export function MushafPicker({ t, lang, chosen, onChoose }: Props) {
  const [family, setFamily] = useState<EditionFamily>(
    () => EDITIONS.find((e) => e.id === chosen)?.family ?? 'uthmani',
  )
  const ar = isArabicScript(lang)
  const listed = EDITIONS.filter((e) => e.family === family)
  const missing = UNAVAILABLE[family]

  const familyName: Record<EditionFamily, string> = {
    uthmani: t.familyUthmani,
    tajweed: t.familyTajweed,
    indopak: t.familyIndoPak,
  }

  return (
    <div className="picker">
      <p className="picker-hint">{t.pickerHint}</p>
      <h2 className="picker-h">{t.chooseMushaf}</h2>

      <div className="seg picker-seg" role="tablist" aria-label={t.chooseMushaf}>
        {FAMILIES.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={family === f}
            onClick={() => setFamily(f)}
          >
            {familyName[f]}
          </button>
        ))}
      </div>

      <ul className="picker-list">
        {listed.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className={`picker-card${e.id === chosen ? ' is-chosen' : ''}`}
              aria-pressed={e.id === chosen}
              onClick={() => onChoose(e.id)}
            >
              {e.id === chosen && (
                <span className="picker-tick" aria-hidden="true">
                  <Check size={22} />
                </span>
              )}
              <span className="picker-body">
                {e.badge && <span className="picker-badge">{t.experimental}</span>}
                <span className="picker-name">{ar ? e.nameAr : e.name}</span>
                <span className="picker-desc">{ar ? e.descriptionAr : e.description}</span>
                {/*
                    What you keep by choosing this one.

                    Stated on the card rather than buried, because it is the
                    only thing that actually differs between a good mushaf app
                    and a bad one, and it is invisible until you need it.
                */}
                <span className="picker-can">
                  {e.kind === 'text' ? t.editionLive : t.editionGlyphs}
                </span>
              </span>
              <Preview edition={e} />
            </button>
          </li>
        ))}
      </ul>

      {missing.length > 0 && (
        <div className="picker-missing">
          <h3>{t.notYetHere}</h3>
          <ul>
            {missing.map((m) => (
              <li key={m.name}>
                <strong>{m.name}</strong> — {t.unavailableWhy[m.reason]}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * The thumbnail on the right of a card.
 *
 * The reference app shows a photograph of the printed page. Ours draws the
 * thing itself — the last three surahs, in the edition's own colouring, in
 * the app's own font — because it can, and because a screenshot of a mushaf
 * that is not the mushaf you will get is a small lie on a screen whose whole
 * job is telling you what you are choosing.
 */
function Preview({ edition }: { edition: Edition }) {
  return (
    <span className={`picker-preview${edition.tajweed ? ' is-tajweed' : ''}`} aria-hidden="true">
      <span className="pp-band" />
      <span className="pp-line" lang="ar">
        {edition.tajweed ? (
          <>
            <em className="tj-h">ٱ</em>لْحَمْدُ لِلَّهِ رَبِّ <em className="tj-m2">ٱلْعَـٰ</em>لَمِينَ
          </>
        ) : (
          'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ'
        )}
      </span>
      <span className="pp-band" />
      <span className="pp-line" lang="ar">
        {edition.tajweed ? (
          <>
            قُلْ هُوَ <em className="tj-g">ٱللَّ</em>هُ أَحَدٌ
          </>
        ) : (
          'قُلْ هُوَ ٱللَّهُ أَحَدٌ'
        )}
      </span>
    </span>
  )
}
