import { memo } from 'react'
import type { Lang, Strings } from '../i18n'
import { digits, toArabicDigits } from '../i18n/script'
import type { Layout } from '../mushaf/data'
import {
  FRACTIONS,
  hizbOfVerse,
  juzOfVerse,
  rubInHizbOfVerse,
  type UnitWord,
} from '../mushaf/divisions'
import { runs, type Span, type Tajweed } from '../mushaf/tajweed'
import surahMeta from '../../data/surahs.json'

const NAMES = new Map(
  (surahMeta as { surah: number; name: string; nameEn: string }[]).map((m) => [m.surah, m]),
)

/**
 * Whether a surah is printed with the basmala above it.
 *
 * Two exceptions, for opposite reasons. At-Tawbah is the one surah of the
 * Quran that opens without it. Al-Fatiha opens with it as ayah 1 — it is
 * already in the text on the line below, and printing it here would set it
 * twice.
 */
export const showsBasmala = (surah: number) => surah !== 1 && surah !== 9

/**
 * One word of the page.
 *
 * Memoised because the highlight moves several times a second while audio
 * plays, and without this every word on the page — about a hundred and fifty
 * of them — was reconciled on each move to change the class on two.
 */
const MushafWord = memo(function MushafWord({
  text,
  wordKey,
  active,
  inAyah,
  lead,
  spans,
  onSeek,
}: {
  text: string
  wordKey: string | undefined
  active: boolean
  inAyah: boolean
  lead: boolean
  spans?: Span[]
  onSeek?: (key: string) => void
}) {
  if (!wordKey) {
    return (
      <span className={`ayah-mark${inAyah ? ' in-ayah' : ''}`} aria-hidden="true">
        {text}
      </span>
    )
  }
  return (
    <span
      className={`mw${active ? ' is-now' : ''}${inAyah ? ' in-ayah' : ''}${
        onSeek ? ' tap' : ''
      }${lead ? ' is-lead' : ''}`}
      onClick={onSeek ? () => onSeek(wordKey) : undefined}
    >
      {/*
          Coloured inside, whole outside.

          Tajweed rules colour letters, not words, so the word is cut into
          runs — but it stays one element, which keeps the highlight, the tap
          target, the Veil and the fit measurement working unchanged. A word
          with no rules is rendered as bare text with no wrapper: about a
          third of the Quran's words carry no colour and they should not each
          cost a span.
      */}
      {spans?.length
        ? runs(text, spans).map((r, i) =>
            r.rule ? (
              <span key={i} className={`tj tj-${r.rule}`}>
                {r.text}
              </span>
            ) : (
              r.text
            ),
          )
        : text}
    </span>
  )
})

type Props = {
  layout: Layout
  /** 1-based, as the mushaf numbers them. */
  page: number
  lang: Lang
  t: Strings
  unitWord: UnitWord
  /** The basmala as this mushaf prints it, read out of the layout once. */
  basmala: string | null
  activeKey: string | null
  /** Surah and ayah being recited, for shading the whole verse. */
  activeSurah: number | null
  activeAyah: number | null
  rules: Tajweed | null
  /** The line Talqeen is working on, when it is on this page. */
  drillLine: number | null
  /** Print the margins — full screen only, where nothing else names the place. */
  margins: boolean
  onSeek?: (key: string) => void
}

/**
 * One leaf of the mushaf: its margins, its fifteen lines, its number.
 *
 * A page rather than a viewport, because the reader now turns pages sideways
 * through a strip of them and every one has to be self-contained — its own
 * juz in one corner, its own surah in the other, its own number at the foot,
 * exactly as a printed leaf carries them.
 */
export const MushafPage = memo(function MushafPage({
  layout,
  page,
  lang,
  t,
  unitWord,
  basmala,
  activeKey,
  activeSurah,
  activeAyah,
  rules,
  drillLine,
  margins,
  onSeek,
}: Props) {
  const lines = layout.pages[page - 1] ?? []

  /*
   * Where this leaf sits, read off the leaf itself.
   *
   * From its last verse, not from its page number. A page number only means
   * something alongside the edition it came from — an IndoPak mushaf runs to
   * 610 pages and numbers them its own way — while the verse is the same
   * verse in every edition, and the juz is a division of the text. Its
   * *last* verse, because where a page carries two surahs the reader has
   * finished the first and is reading into the second.
   */
  let lastKey = '1:1'
  for (const line of lines) {
    for (const w of line.w) {
      if (!w[1]) continue
      const [s, a] = w[1].split(':')
      lastKey = `${s}:${a}`
    }
  }
  const marginSurah = NAMES.get(Number(lastKey.split(':')[0]))
  const juz = juzOfVerse(lastKey)
  const hizb = hizbOfVerse(lastKey)
  const fraction = FRACTIONS[rubInHizbOfVerse(lastKey) - 1]

  /** The surah that begins on a given line, if one does. */
  const opensWith = (line: (typeof lines)[number]) => {
    for (const w of line.w) {
      const key = w[1]
      if (!key) continue
      const [sn, ayah, word] = key.split(':').map(Number)
      // A surah's very first word is where its heading belongs.
      if (ayah === 1 && word === 1) return sn
    }
    return null
  }

  return (
    <article className="mpage" data-page={page}>
      {margins && (
        <header className="mpage-head" aria-hidden="true">
          {/*
              "Juz' 4, ½ Hizb 8" — the fraction is what has elapsed, so the
              first quarter of a hizb carries no mark: you are at its start,
              not a quarter into it.
          */}
          <span className="mpage-place">
            {(unitWord === 'para' ? t.paraN : t.juzN)(digits(lang, juz))}
            {', '}
            {fraction && `${fraction} `}
            {t.hizbN(digits(lang, hizb))}
          </span>
          <span className="mpage-surah">
            {lang !== 'ar' && <span className="mpage-surah-en">{marginSurah?.nameEn}</span>}
            <span className="mpage-surah-ar" lang="ar">
              {marginSurah?.name}
            </span>
          </span>
        </header>
      )}

      {/*
          The leaf is a fixed box and the lines are scaled to fit inside it.

          Sizing the type by height directly is what made the words drift so
          far apart: the line was set small enough for fifteen of them to fit
          vertically, then justified edge to edge, and the slack went into the
          gaps. So the type is sized to fill the *measure* — which is what
          gives a mushaf its even, tight spacing — and the whole block is then
          scaled down as one if it is too tall. The gaps shrink with it.
      */}
      <div className="mpage-body">
        <div className="mpage-lines" lang="ar">
          {lines.map((line) => {
            const opens = opensWith(line)
            return (
              <div className="mushaf-row" key={line.n}>
                {opens !== null && (
                  <span className="surah-band">
                    <span className="surah-band-name" lang="ar">
                      سُورَةُ {NAMES.get(opens)?.name}
                    </span>
                  </span>
                )}
                {opens !== null && showsBasmala(opens) && basmala && (
                  <p className="mushaf-basmala" lang="ar">
                    {basmala}
                  </p>
                )}
                <p
                  className={`mushaf-line${line.n === drillLine ? ' is-drill' : ''}${
                    line.w.length <= 3 ? ' is-short' : ''
                  }`}
                >
                  {line.w.map((w, i) => {
                    // The rosette belongs to the ayah it closes and carries no
                    // key, so it takes its shading from the word before it —
                    // otherwise an ayah's last word sits inside the highlight
                    // with its own number left outside.
                    const key = w[1] ?? line.w[i - 1]?.[1]
                    const ayah = key ? Number(key.split(':')[1]) : null
                    return (
                      <MushafWord
                        key={`${line.n}-${i}`}
                        text={w[0]}
                        wordKey={w[1]}
                        // A line can open with a rosette, so "first word" is
                        // not the same as first child.
                        lead={i === line.w.findIndex((x) => x[1])}
                        active={w[1] !== undefined && w[1] === activeKey}
                        inAyah={
                          activeAyah !== null &&
                          ayah === activeAyah &&
                          key?.startsWith(`${activeSurah}:`) === true
                        }
                        spans={w[1] ? rules?.[w[1]] : undefined}
                        onSeek={onSeek}
                      />
                    )
                  })}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {margins && (
        <footer className="mpage-foot" aria-hidden="true">
          {/* The number as the mushaf prints it — Arabic-Indic always, like
              the numerals in the rosettes, not in the reader's own digits. */}
          {toArabicDigits(page)}
        </footer>
      )}
    </article>
  )
})
