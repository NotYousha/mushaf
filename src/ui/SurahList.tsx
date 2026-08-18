import type { SurahView } from '../catalog/types'
import { Play, Handle, Download, Saved } from './Icons'

/** Bare surah name, diacritics removed, for the small line under the title. */
export const plainName = (s: string) =>
  s.replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, '').trim()

type Props = {
  surahs: SurahView[]
  reciterId: string
  downloaded: Set<number>
  progress: Record<string, number>
  current: number | null
  verified: (s: SurahView) => boolean
  onPlay: (surah: number) => void
  onDownload: (surah: number) => void
}

export function SurahList({
  surahs,
  reciterId,
  downloaded,
  progress,
  current,
  verified,
  onPlay,
  onDownload,
}: Props) {
  // A surah saved from your own files is playable even if the catalog has not
  // published it, so it belongs in the main list rather than the pending one.
  const playable = (s: SurahView) => s.released || downloaded.has(s.surah)
  const released = surahs.filter(playable)
  const upcoming = surahs.filter((s) => !playable(s))
  // Specifically the last broadcast surah — an imported file is not one.
  const lastRecorded = [...released].reverse().find((s) => s.released)

  if (!surahs.length) {
    return <p className="empty">لا توجد نتائج</p>
  }

  return (
    <>
      <ul className="surah-list">
        {released.map((s) => {
          const active = current === s.surah
          const have = downloaded.has(s.surah)
          const pct = progress[`${reciterId}:${s.surah}`]
          return (
            <li key={s.surah}>
              <button
                className={`row${active ? ' active' : ''}`}
                onClick={() => onPlay(s.surah)}
                aria-current={active ? 'true' : undefined}
              >
                <span className="numeral">{s.surah}</span>

                <span className="names">
                  <span className="name-ar">سُورَةُ {s.name}</span>
                  <span className="name-plain">
                    {s.nameEn} · {s.translation}
                  </span>
                </span>

                <span className="row-end">
                  {pct !== undefined ? (
                    <span className="ring">{Math.round(pct * 100)}%</span>
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={have ? 'Saved offline' : 'Save for offline'}
                      className={`mini${have ? ' is-saved' : ''}${
                        !verified(s) ? ' needs-check' : ''
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!have) onDownload(s.surah)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation()
                          e.preventDefault()
                          if (!have) onDownload(s.surah)
                        }
                      }}
                    >
                      {have ? <Saved size={19} /> : <Download size={19} />}
                    </span>
                  )}

                  {active ? (
                    <span className="play-dot">
                      <Play size={20} />
                    </span>
                  ) : (
                    <Handle size={20} />
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {lastRecorded && upcoming.length > 0 && (
        <div className="frontier">
          <div className="fade" />
          <p>
            آخر سورة مُسجَّلة: {plainName(lastRecorded.name)}
            <br />
            المصحف ما زال قيد التسجيل — تُضاف السور الجديدة تلقائيًا
          </p>
        </div>
      )}

      <ul className="surah-list">
        {upcoming.map((s) => (
          <li key={s.surah}>
            <button className="row" disabled>
              <span className="numeral">{s.surah}</span>
              <span className="names">
                <span className="name-ar">سُورَةُ {s.name}</span>
                <span className="name-plain">{plainName(s.name)}</span>
              </span>
              <span className="row-end" />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
