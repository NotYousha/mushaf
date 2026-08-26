import { useEffect, useRef, useState } from 'react'
import type { Strings } from '../i18n'
import { Play, Pause, Forward } from './Icons'
import { isNativeShell } from '../native/shell'

export type DockTab = {
  id: string
  label: string
  icon: React.ReactNode
  onSelect: () => void
}

type Props = {
  t: Strings
  tabs: DockTab[]
  active: string
  /** What is playing, or null for nothing to show. */
  now: {
    title: string
    reciter: string
    /** Which reciter, so a photo that is not pre-cropped can be framed. */
    reciterId: string
    artwork: string | null
    /** Framing for the card, when the picture is one the listener supplied. */
    artFrame?: { zoom: number; x: number; y: number } | null
    playing: boolean
  } | null
  onOpenPlayer: () => void
  onToggle: () => void
  onNext: () => void
  /** The element whose scrolling collapses the dock. */
  scroller: React.RefObject<HTMLElement | null>
}

/**
 * The bottom dock.
 *
 * Floating glass rather than a bar welded to the edge, because the list runs
 * underneath it and the blur is what tells you there is more page down there.
 *
 * Scrolling down draws it in a little — the labels shrink away, the pill and
 * the capsule lose some height — and scrolling back up, or reaching the top,
 * lets it out again. Reading gets a few pixels back and the transport never
 * leaves the screen.
 *
 * Inside a native shell this renders nothing: the platform's own tab bar owns
 * the bottom of the screen there, with the real Liquid Glass that no web view
 * can draw.
 */
export function Dock({
  t,
  tabs,
  active,
  now,
  onOpenPlayer,
  onToggle,
  onNext,
  scroller,
}: Props) {
  const [tight, setTight] = useState(false)
  /** True only while the list is actually moving. */
  const [scrolling, setScrolling] = useState(false)
  const lastY = useRef(0)
  const settle = useRef(0)
  /*
   * The same flag the class is drawn from, readable from the ResizeObserver
   * below without making it re-subscribe on every scroll. It is written in
   * the scroll frame, before React commits the class, so by the time the
   * observer sees the contracted dock this already says why it is smaller.
   */
  const tightRef = useRef(false)

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let frame = 0
    const onScroll = () => {
      // Read on a frame rather than per event: the scroll handler must not do
      // layout work while the list is moving.
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        /*
         * Blurring the backdrop means re-sampling whatever the list painted
         * under the dock, every frame, for as long as it moves — which is
         * the most expensive thing this page asks of a phone's GPU, and it
         * asks for it exactly when frames are scarcest. So the blur is
         * dropped for a flat fill while scrolling and restored once the list
         * comes to rest, where it is what anyone actually looks at.
         */
        const y = el.scrollTop
        const delta = y - lastY.current
        /*
         * The dead zone comes first.
         *
         * Dropping the blur used to happen before this check, so a one-pixel
         * thumb flick — a scroll event with a delta of nothing — still swapped
         * the glass for a flat fill and swapped it back 140ms later. The dock
         * strobed at rest. A movement too small to fold the dock is too small
         * to be worth dropping the blur for either.
         */
        if (Math.abs(delta) < 6) return

        /*
         * Blurring the backdrop means re-sampling whatever the list painted
         * under the dock, every frame, for as long as it moves — so the blur
         * is dropped for a flat fill while scrolling and restored once the
         * list comes to rest, where it is what anyone actually looks at.
         *
         * The settle has to outlast the fold. The capsule and the tabs resize
         * for --t-base, and if the blur came back while they were still moving
         * we would be re-blurring a changing geometry every frame, which is
         * the exact cost this is here to avoid.
         */
        setScrolling(true)
        window.clearTimeout(settle.current)
        settle.current = window.setTimeout(() => setScrolling(false), 240)
        lastY.current = y
        // Near the top there is nothing to gain by drawing in, and a dock
        // that stays contracted at rest looks broken.
        const next = y > 24 && delta > 0
        tightRef.current = next
        setTight(next)
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
      window.clearTimeout(settle.current)
    }
  }, [scroller])

  /**
   * Publish the dock's real height, so the list above it can clear it.
   *
   * The scroll area used to reserve a fixed 6.5rem. That is right for the
   * tab bar alone and wrong the moment something is playing: the capsule
   * wraps onto a line of its own and the dock grows by another three and a
   * half rem, which is exactly enough to sit over the last row of a list.
   * On the home screen it covered the names under the bottom row of faces.
   *
   * Measured rather than assumed, because the dock grows with the safe area
   * and with what is playing, and a second hardcoded number would only be
   * wrong in a different place.
   *
   * What is published is the dock's *resting* height, never its contracted
   * one. Publishing the contracted height would shrink the list's bottom
   * padding by those nine pixels, and a reader already at the end of the list
   * has their scroll position clamped by the browser when the scrollable
   * height drops under it — so the words move under them at the exact moment
   * they are reading. The contraction is a few pixels of polish; that is a
   * lost line. Reserving the resting height costs nothing but a sliver of
   * empty glass while contracted, and the dock is back at resting size by the
   * time anyone stops to look at it.
   */
  const dockRef = useRef<HTMLDivElement | null>(null)
  const restingH = useRef(0)
  useEffect(() => {
    const el = dockRef.current
    if (!el) return
    const publish = () => {
      const h = el.offsetHeight
      if (!tightRef.current) restingH.current = h
      // Growing is always safe — extra padding at the end of a list moves
      // nothing — so a dock that grows while contracted, which is what
      // happens when playback starts mid-scroll and the capsule appears,
      // still gets its room straight away.
      document.documentElement.style.setProperty(
        '--dock-h',
        `${Math.max(h, restingH.current)}px`,
      )
    }
    publish()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (isNativeShell()) return null

  /*
   * is-tight used to be gated on `now` as well, so the dock only ever drew
   * itself in while something was playing — which is to say almost never, and
   * never at all on a fresh list, where scrolling did nothing whatsoever. The
   * bar answers the gesture whether or not there is a capsule in it.
   */
  const cls = `dock${tight ? ' is-tight' : ''}${scrolling ? ' is-scrolling' : ''}`

  return (
    <div ref={dockRef} className={cls}>
      {now && (
        <div className="now-capsule glass">
          <button
            type="button"
            className="cap-open"
            onClick={onOpenPlayer}
            aria-label={t.openPlayer}
          >
            <span
              className="cap-art"
              aria-hidden="true"
              data-reciter={now.reciterId}
              style={
                now.artwork
                  ? {
                      backgroundImage: `url('${now.artwork}')`,
                      ...(now.artFrame
                        ? {
                            backgroundSize: `${now.artFrame.zoom}% auto`,
                            backgroundPosition: `${now.artFrame.x}% ${now.artFrame.y}%`,
                          }
                        : {}),
                    }
                  : undefined
              }
            />
            <span className="cap-text">
              <span className="cap-title">{now.title}</span>
              <span className="cap-sub">{now.reciter}</span>
            </span>
          </button>
          <button
            type="button"
            className="cap-btn"
            onClick={onToggle}
            aria-label={now.playing ? t.pause : t.play}
          >
            {now.playing ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button type="button" className="cap-btn" onClick={onNext} aria-label={t.next}>
            <Forward size={20} />
          </button>
        </div>
      )}

      <nav className="dock-tabs glass" role="tablist">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            className="dock-tab"
            role="tab"
            aria-selected={tb.id === active}
            onClick={tb.onSelect}
          >
            {tb.icon}
            <span>{tb.label}</span>
          </button>
        ))}
      </nav>

    </div>
  )
}
