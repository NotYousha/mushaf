import { memo } from 'react'
import type { SurahView } from '../catalog/types'
import { voiceLabel } from '../catalog/voice'
import type { Strings, Lang } from '../i18n'
import { Play, Handle, Download, Saved } from './Icons'

/** Bare surah name, diacritics removed. */
export const plainName = (s: string) => s.replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, '').trim()

type Props = {
  surahs: SurahView[]
  reciterId: string
  lang: Lang
  t: Strings
  /** Marked by the listener as playing the wrong recitation. */
  rejected?: Set<number>
  downloaded: Set<number>
  /** Interrupted downloads: surah number to the fraction already stored. */
  partials?: Map<number, number>
  progress: Record<string, number>
  current: number | null
  verified: (s: SurahView) => boolean
  onPlay: (surah: number) => void
  onDownload: (surah: number) => void
}

/**
 * Memoised, and its callers hand it stable callbacks.
 *
 * The player sets the playback position about four times a second. Without
 * this the whole list reconciled on every one of those ticks — 114 rows of
 * diffing, during the scroll that the ticks are most likely to coincide with.
 */
export const SurahList = memo(function SurahList({
  surahs,
  reciterId,
  lang,
  t,
  rejected,
  downloaded,
  partials,
  progress,
  current,
  verified,
  onPlay,
  onDownload,
}: Props) {
  // A surah saved from your own files is playable even if the catalog has not
  // published it, so it belongs in the main list rather than the pending one.
  const playable = (s: SurahView) =>
    (s.released || downloaded.has(s.surah)) && !rejected?.has(s.surah)
  const listed = surahs.filter(playable)
  const upcoming = surahs.filter((s) => !playable(s))
  // Specifically the last broadcast surah — an imported file is not one.
  const lastRecorded = [...listed].reverse().find((s) => s.released)

  if (!surahs.length) return <p className="empty">{t.noResults}</p>

  return (
    <>
      <ul className="surah-list">
        {listed.map((s) => {
          const active = current === s.surah
          const have = downloaded.has(s.surah)
          const pct = progress[`${reciterId}:${s.surah}`]
          // Stored but unfinished: tapping continues from where it stopped
          // rather than starting the file over.
          const held = partials?.get(s.surah)
          return (
            <li key={s.surah} className={`row${active ? ' active' : ''}`}>
              {/* The row and the save control are siblings, never nested. A
                  button inside a button is invalid markup and swallows taps,
                  which is why saving a surah did nothing on a phone. */}
              <button
                type="button"
                className="row-main"
                onClick={() => onPlay(s.surah)}
                aria-current={active ? 'true' : undefined}
              >
                <span className="numeral">{s.surah}</span>
                <span className="names">
                  <span className="name-ar">
                    {t.surahWord} {s.name}
                  </span>
                  {lang === 'en' && (
                    <span className="name-plain">
                      {s.nameEn} · {s.translation}
                    </span>
                  )}
                  {/* Not gated on language the way the gloss above is. A
                      gloss is a convenience for one language; who is
                      reciting is information every reader wants, and
                      voiceLabel already picks the right script. */}
                  {voiceLabel(s, lang) && (
                    <span className="name-voice">{voiceLabel(s, lang)}</span>
                  )}
                </span>
              </button>

              <span className="row-end">
                {pct !== undefined ? (
                  <span className="ring">{Math.round(pct * 100)}%</span>
                ) : (
                  <button
                    type="button"
                    className={`mini${have ? ' is-saved' : ''}${held !== undefined ? ' is-partial' : ''}${!verified(s) ? ' needs-check' : ''}`}
                    aria-label={
                      have
                        ? t.saved
                        : held !== undefined
                          ? t.resumeAt(Math.round(held * 100))
                          : t.save
                    }
                    disabled={have}
                    onClick={() => onDownload(s.surah)}
                  >
                    {have ? <Saved size={20} /> : <Download size={20} />}
                    {held !== undefined && (
                      <span className="mini-pct">{Math.round(held * 100)}%</span>
                    )}
                  </button>
                )}

                {active ? (
                  <span className="play-dot" aria-hidden="true">
                    <Play size={20} />
                  </span>
                ) : (
                  <Handle size={20} />
                )}
              </span>
            </li>
          )
        })}
      </ul>

      {lastRecorded && upcoming.length > 0 && (
        <div className="frontier">
          <div className="fade" />
          <p>
            {lang === 'ar'
              ? `آخر سورة متاحة: ${plainName(lastRecorded.name)}`
              : `Last available: ${lastRecorded.nameEn}`}
          </p>
        </div>
      )}

      <ul className="surah-list">
        {upcoming.map((s) => (
          <li key={s.surah} className="row is-off">
            <span className="row-main">
              <span className="numeral">{s.surah}</span>
              <span className="names">
                <span className="name-ar">
                  {t.surahWord} {s.name}
                </span>
                {lang === 'en' && (
                  <span className="name-plain">
                    {s.nameEn} · {s.translation}
                  </span>
                )}
              </span>
            </span>
            <span className="row-end small">
              {rejected?.has(s.surah) ? t.excluded : t.notRecorded}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
})
