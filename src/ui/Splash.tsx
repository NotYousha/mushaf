import { useEffect, useState } from 'react'
import { brandSecondary } from '../brand'
import { isLatinText } from '../i18n/script'
import type { Lang } from '../i18n'

/**
 * The opening.
 *
 * The wordmark settles, a sheen crosses the gold once, and the app is already
 * behind it — the splash never gates rendering, it only covers a load that was
 * going to happen anyway. If the app is ready sooner the splash still finishes
 * its beat, because a flash of something half-formed reads worse than a moment
 * of stillness.
 *
 * Shown once per launch rather than on every mount, so moving between tabs
 * never replays it. Under reduced motion it is a plain fade: same beat, none
 * of the travel.
 */

const SEEN = 'mushaf:launched'
const BASE = import.meta.env?.BASE_URL ?? '/'

export function Splash({ lang }: { lang: Lang }) {
  const [state, setState] = useState<'hidden' | 'running' | 'leaving'>(() => {
    if (typeof sessionStorage === 'undefined') return 'running'
    try {
      return sessionStorage.getItem(SEEN) ? 'hidden' : 'running'
    } catch {
      // Private windows can throw on access; a splash is not worth failing over.
      return 'running'
    }
  })

  useEffect(() => {
    if (state !== 'running') return
    try {
      sessionStorage.setItem(SEEN, '1')
    } catch {
      /* nothing to do */
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const hold = reduced ? 400 : 1650
    const leave = window.setTimeout(() => setState('leaving'), hold)
    // Matches the fade in CSS; unmounting sooner would cut it off.
    const done = window.setTimeout(() => setState('hidden'), hold + 420)
    return () => {
      window.clearTimeout(leave)
      window.clearTimeout(done)
    }
  }, [state])

  if (state === 'hidden') return null

  return (
    <div
      className={`splash${state === 'leaving' ? ' is-leaving' : ''}`}
      // The app underneath is the real content; this is a curtain over it.
      aria-hidden="true"
    >
      <div className="splash-mark">
        {/* The same mark as the app icon and the header badge — one brand
            object, cut from the wordmark at 4K. `.splash-mark` rounds it to
            26%, so the file itself is a plain square. */}
        <img src={`${BASE}logo-mark.webp`} alt="" width={168} height={168} />
        <span className="splash-sheen" />
      </div>
      {/* Tracked at 0.3em, which is severe — and this is the other script,
          so for an English reader it is Arabic. Only Latin takes it. */}
      <span
        className={`splash-alt${isLatinText(brandSecondary(lang)) ? ' trk' : ''}`}
      >
        {brandSecondary(lang)}
      </span>
    </div>
  )
}
