import { useMemo } from 'react'

type Props = {
  progress: number // 0..1
  seed: number
  onSeek: (fraction: number) => void
}

/**
 * The seek control, drawn as the gold ridge that closes the mushaf artwork.
 * Played audio is solid gold; the ridge ahead of you stays faint.
 *
 * The shape is derived deterministically from the surah number so each surah
 * keeps its own skyline between sessions — it is an identity, not a readout of
 * the actual audio, which would cost a full decode to compute.
 */
export function Waveform({ progress, seed, onSeek }: Props) {
  const bars = useMemo(() => {
    // Small deterministic PRNG so a surah's ridge never changes.
    let x = seed * 9301 + 49297
    const rand = () => {
      x = (x * 9301 + 49297) % 233280
      return x / 233280
    }
    return Array.from({ length: 72 }, (_, i) => {
      const envelope = Math.sin((i / 71) * Math.PI) * 0.55 + 0.45
      return Math.max(0.12, Math.min(1, (0.35 + rand() * 0.65) * envelope))
    })
  }, [seed])

  const handle = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)))
  }

  const w = 300
  const barW = w / bars.length

  return (
    <svg
      className="wave"
      viewBox={`0 0 ${w} 30`}
      preserveAspectRatio="none"
      onClick={handle}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      tabIndex={0}
    >
      <defs>
        <linearGradient id="goldRamp" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#a67c2e" />
          <stop offset="60%" stopColor="#c9a227" />
          <stop offset="100%" stopColor="#e8d08a" />
        </linearGradient>
        <clipPath id="playedClip">
          <rect x="0" y="0" width={w * progress} height="30" />
        </clipPath>
      </defs>

      <g className="ridge-ahead">
        {bars.map((h, i) => (
          <rect
            key={i}
            x={i * barW + barW * 0.2}
            y={30 - h * 28}
            width={barW * 0.6}
            height={h * 28}
            rx={barW * 0.3}
          />
        ))}
      </g>

      <g className="ridge-played" clipPath="url(#playedClip)">
        {bars.map((h, i) => (
          <rect
            key={i}
            x={i * barW + barW * 0.2}
            y={30 - h * 28}
            width={barW * 0.6}
            height={h * 28}
            rx={barW * 0.3}
          />
        ))}
      </g>
    </svg>
  )
}
