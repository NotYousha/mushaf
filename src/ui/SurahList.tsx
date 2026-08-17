import type { SurahView } from '../catalog/types'
import { formatBytes } from './format'

type Props = {
  surahs: SurahView[]
  downloaded: Set<number>
  progress: Record<number, number>
  current: number | null
  verified: (s: SurahView) => boolean
  onPlay: (surah: number) => void
  onDownload: (surah: number) => void
}

export function SurahList({
  surahs,
  downloaded,
  progress,
  current,
  verified,
  onPlay,
  onDownload,
}: Props) {
  const released = surahs.filter((s) => s.released)
  const upcoming = surahs.filter((s) => !s.released)
  const lastReleased = released[released.length - 1]

  return (
    <>
      <ul className="surah-list">
        {released.map((s) => {
          const have = downloaded.has(s.surah)
          const pct = progress[s.surah]
          return (
            <li key={s.surah}>
              <button
                className={`surah${have ? ' is-ready' : ''}`}
                onClick={() => onPlay(s.surah)}
                aria-current={current === s.surah ? 'true' : undefined}
              >
                <span className="numeral">{s.surah}</span>
                <span className="names">
                  <span className="name-ar">{s.name}</span>
                  <span className="name-en">
                    {s.nameEn} · {s.ayahs} ayahs · {formatBytes(s.bytes)}
                  </span>
                </span>
                <span className="state">
                  {!verified(s) && <span className="tag unverified">check</span>}
                  {pct !== undefined ? (
                    <span className="bar">
                      <span style={{ width: `${Math.round(pct * 100)}%` }} />
                    </span>
                  ) : have ? (
                    <>
                      <span className="dot" />
                      offline
                    </>
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      className="dl"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDownload(s.surah)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation()
                          e.preventDefault()
                          onDownload(s.surah)
                        }
                      }}
                    >
                      save
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {/* The recording stops here because it has not been made yet, so the
          rule fades out rather than ending. */}
      <div className="frontier">
        <div className="fade" />
        <p>
          <span className="ar">{lastReleased?.name}</span> is the last surah recorded.
          <br />
          The mushaf is still being produced — new surahs air nightly and appear here on their own.
        </p>
      </div>

      <ul className="surah-list">
        {upcoming.map((s) => (
          <li key={s.surah}>
            <button className="surah" disabled>
              <span className="numeral">{s.surah}</span>
              <span className="names">
                <span className="name-ar">{s.name}</span>
                <span className="name-en">
                  {s.nameEn} · {s.ayahs} ayahs
                </span>
              </span>
              <span className="state">not recorded</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
