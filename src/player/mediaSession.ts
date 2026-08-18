import type { SurahView } from '../catalog/types'

type Handlers = {
  next: () => void
  prev: () => void
  seek: (t: number) => void
  play: () => void
  pause: () => void
}

/**
 * Lock-screen and headphone controls. Best-effort throughout: playback must
 * never depend on this succeeding, so every call is wrapped.
 */
export function updateMediaSession(s: SurahView, h: Handlers) {
  const ms = (navigator as unknown as { mediaSession?: MediaSession })?.mediaSession
  if (!ms) return

  try {
    const MM = (globalThis as unknown as { MediaMetadata?: typeof MediaMetadata }).MediaMetadata
    if (MM) {
      ms.metadata = new MM({
        title: `${s.name} · ${s.nameEn}`,
        artist: 'ياسر الدوسري',
        album: 'المصحف المرتل',
        artwork: [
          {
            src: `${import.meta.env.BASE_URL}icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      })
    }
    ms.setActionHandler('play', h.play)
    ms.setActionHandler('pause', h.pause)
    ms.setActionHandler('nexttrack', h.next)
    ms.setActionHandler('previoustrack', h.prev)
    ms.setActionHandler('seekto', (d) => {
      if (typeof d.seekTime === 'number') h.seek(d.seekTime)
    })
  } catch {
    // Older engines reject unknown action handlers. Not fatal.
  }
}
