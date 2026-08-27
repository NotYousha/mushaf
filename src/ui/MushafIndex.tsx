import { memo, useState } from 'react'
import type { Lang, Strings } from '../i18n'
import { digits } from '../i18n/script'
import surahMeta from '../../data/surahs.json'
import {
  hizbsOfJuz,
  juz,
  rubsOfHizb,
  surahPage,
  surahsOfJuz,
  type UnitWord,
} from '../mushaf/divisions'
import { Chevron } from './Icons'

type Meta = {
  surah: number
  name: string
  nameEn: string
  translation: string
  ayahs: number
  revelation: string
}

const META = new Map((surahMeta as Meta[]).map((m) => [m.surah, m]))

type Props = {
  t: Strings
  lang: Lang
  /** Juz, or Para — whichever this mushaf edition calls it. */
  unitWord?: UnitWord
  /** The page the reader is on, so the index can mark where they are. */
  page?: number
  onOpenPage: (page: number) => void
}

type Mode = 'surahs' | 'units'

/**
 * The way into the mushaf, by surah or by juz.
 *
 * Not the surah list on the Quran tab. That one belongs to a reciter — it
 * says who is reading, what is downloaded, what is still to be recorded, and
 * every row starts playback. This one belongs to the *book*: every row is a
 * page number, and tapping one turns to that page whether or not anything is
 * playing. Trying to serve both from one list is what would make either of
 * them worse.
 *
 * Two ways in, because people hold the Quran two ways. Someone looking for
 * Al-Kahf wants a surah; someone reading a juz a day, or standing behind an
 * imam in Ramadan, wants a juz — and, increasingly precisely, a hizb and then
 * a quarter of one, which is the unit a night of Taraweeh is actually
 * measured in.
 */
export const MushafIndex = memo(function MushafIndex({
  t,
  lang,
  unitWord = 'juz',
  page,
  onOpenPage,
}: Props) {
  const [mode, setMode] = useState<Mode>('surahs')
  /** Which juz headings are folded away, by number. */
  const [folded, setFolded] = useState<Set<number>>(new Set())
  /** Which juz is opened out into its hizbs, in the units view. One at a
   *  time: thirty juz each showing two hizbs and eight quarters is three
   *  hundred rows, and nobody is reading all of them. */
  const [openUnit, setOpenUnit] = useState<number | null>(null)

  const unitName = unitWord === 'para' ? t.paraN : t.juzN

  const fold = (n: number) =>
    setFolded((f) => {
      const next = new Set(f)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })

  return (
    <div className="mindex">
      <div className="seg" role="tablist" aria-label={t.mushafIndex}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'surahs'}
          className={mode === 'surahs' ? 'on' : undefined}
          onClick={() => setMode('surahs')}
        >
          {t.surahsTab}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'units'}
          className={mode === 'units' ? 'on' : undefined}
          onClick={() => setMode('units')}
        >
          {unitWord === 'para' ? t.paraTab : t.juzTab}
        </button>
      </div>

      {mode === 'surahs' &&
        juz.map((j) => {
          const shut = folded.has(j.n)
          // Only the surahs that *begin* here. A juz also carries the tail of
          // whatever ran into it, and listing that would print Al-Baqarah
          // under juz 1, 2 and 3 — three rows for one surah.
          const opening = surahsOfJuz(j.n).filter((s) => {
            const p = surahPage(s)
            return p >= j.page && (j.n === 30 || p < juz[j.n].page)
          })
          return (
            <section className="mindex-juz" key={j.n}>
              <button
                type="button"
                className="mindex-h"
                aria-expanded={!shut}
                onClick={() => fold(j.n)}
              >
                <span>{unitName(digits(lang, j.n))}</span>
                <span className={`mindex-chev${shut ? ' is-shut' : ''}`} aria-hidden="true">
                  <Chevron size={18} />
                </span>
              </button>

              {!shut &&
                (opening.length ? (
                  <ul className="mindex-list">
                    {opening.map((s) => (
                      <SurahRow
                        key={s}
                        surah={s}
                        lang={lang}
                        t={t}
                        here={page === surahPage(s)}
                        onOpen={onOpenPage}
                      />
                    ))}
                  </ul>
                ) : (
                  /*
                   * A juz that no surah opens.
                   *
                   * Juz 2 is the middle of Al-Baqarah and nothing begins in
                   * it. A heading with nothing under it reads as a bug, so it
                   * says what it is and offers the one thing a reader wants
                   * from it: its first page.
                   */
                  <ul className="mindex-list">
                    <li className="row mindex-row is-cont">
                      <button
                        type="button"
                        className="row-main"
                        onClick={() => onOpenPage(j.page)}
                      >
                        <span className="names">
                          <span className="name-ar" lang="ar">
                            {t.surahWord} {META.get(surahsOfJuz(j.n)[0])?.name}
                          </span>
                          <span className="name-plain">{t.continues}</span>
                        </span>
                        <span className="mindex-page">{digits(lang, j.page)}</span>
                      </button>
                    </li>
                  </ul>
                ))}
            </section>
          )
        })}

      {mode === 'units' && (
        <ul className="mindex-list mindex-units">
          {juz.map((j) => {
            const open = openUnit === j.n
            return (
              <li key={j.n} className="mindex-unit">
                <button
                  type="button"
                  className="row-main mindex-unit-head"
                  aria-expanded={open}
                  onClick={() => setOpenUnit(open ? null : j.n)}
                >
                  <span className="numeral">{digits(lang, j.n)}</span>
                  <span className="names">
                    <span className="name-plain strong">{unitName(digits(lang, j.n))}</span>
                    <span className="name-plain">
                      {/* Named by where it starts, because that is how
                          someone finds the place they were told to read. */}
                      {META.get(Number(j.start.split(':')[0]))?.nameEn} {j.start}
                    </span>
                  </span>
                  <span className="mindex-page">{digits(lang, j.page)}</span>
                </button>

                {open && (
                  <ul className="mindex-hizbs">
                    {hizbsOfJuz(j.n).map((h) => (
                      <li key={h.n}>
                        <button
                          type="button"
                          className="mindex-hizb"
                          onClick={() => onOpenPage(h.page)}
                        >
                          <span>{t.hizbN(digits(lang, h.n))}</span>
                          <span className="mindex-page">{digits(lang, h.page)}</span>
                        </button>
                        {/*
                            The quarters.

                            Four to a hizb, numbered 1–4 within it rather than
                            1–240 across the mushaf: nobody says "quarter one
                            hundred and sixty-three". The absolute number is
                            what the data carries and what nobody speaks.
                        */}
                        <ul className="mindex-rubs">
                          {rubsOfHizb(h.n).map((r, i) => (
                            <li key={r.n}>
                              <button
                                type="button"
                                className="mindex-rub"
                                onClick={() => onOpenPage(r.page)}
                              >
                                <span>{t.rubN(digits(lang, i + 1))}</span>
                                <span className="mindex-page">{digits(lang, r.page)}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
})

/** One surah, as a place in the book rather than as something to play. */
function SurahRow({
  surah,
  lang,
  t,
  here,
  onOpen,
}: {
  surah: number
  lang: Lang
  t: Strings
  here: boolean
  onOpen: (page: number) => void
}) {
  const m = META.get(surah)
  if (!m) return null
  const page = surahPage(surah)
  return (
    <li className={`row mindex-row${here ? ' active' : ''}`}>
      <button
        type="button"
        className="row-main"
        onClick={() => onOpen(page)}
        aria-current={here ? 'true' : undefined}
      >
        <span className="numeral">{digits(lang, surah)}</span>
        <span className="names">
          {/* Arabic inside an interface that may not be, marked as Arabic so
              a screen reader does not read the surah name in an English
              voice — the same rule the playback list follows. */}
          <span className="name-ar" lang="ar">
            {m.name}
          </span>
          <span className="name-plain">
            {lang === 'ar'
              ? `${m.revelation === 'Meccan' ? t.makki : t.madani} · ${t.ayahCount(digits(lang, m.ayahs))}`
              : `${m.nameEn} · ${m.translation} · ${
                  m.revelation === 'Meccan' ? t.makki : t.madani
                } · ${t.ayahCount(digits(lang, m.ayahs))}`}
          </span>
        </span>
        <span className="mindex-page">{digits(lang, page)}</span>
      </button>
    </li>
  )
}
