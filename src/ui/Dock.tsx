import { useEffect, useRef, useState } from 'react'
import type { Strings } from '../i18n'
import { Play, Pause, Forward, Search } from './Icons'
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
    artwork: string | null
    playing: boolean
  } | null
  onOpenPlayer: () => void
  onToggle: () => void
  onNext: () => void
  onSearch: () => void
  /** The element whose scrolling collapses the dock. */
  scroller: React.RefObject<HTMLElement | null>
}

/**
 * The bottom dock.
 *
 * Floating glass rather than a bar welded to the edge, because the list runs
 * underneath it and the blur is what tells you there is more page down there.
 *
 * Scrolling down folds the tabs away and lets the capsule take the room they
 * leave, so reading gets the screen back without ever losing the transport.
 * Scrolling back up brings them out again.
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
  onSearch,
  scroller,
}: Props) {
  const [tight, setTight] = useState(false)
  /** True only while the list is actually moving. */
  const [scrolling, setScrolling] = useState(false)
  const lastY = useRef(0)
  const settle = useRef(0)

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
        setScrolling(true)
        window.clearTimeout(settle.current)
        settle.current = window.setTimeout(() => setScrolling(false), 140)

        const y = el.scrollTop
        const delta = y - lastY.current
        // A dead zone, so a thumb resting on the list does not flap the dock
        // open and shut.
        if (Math.abs(delta) < 6) return
        lastY.current = y
        // Near the top there is nothing to gain by hiding, and a dock that
        // stays folded at rest looks broken.
        setTight(y > 24 && delta > 0)
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
      window.clearTimeout(settle.current)
    }
  }, [scroller])

  if (isNativeShell()) return null

  return (
    <div
      className={`dock${tight && now ? ' is-tight' : ''}${
        scrolling ? ' is-scrolling' : ''
      }`}
    >
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
              style={now.artwork ? { backgroundImage: `url('${now.artwork}')` } : undefined}
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

      <button className="dock-circle glass" onClick={onSearch} aria-label={t.search}>
        <Search size={22} />
        {/* Shown only on the rail, where every other item is labelled and a
            lone icon would look unfinished. */}
        <span className="dock-circle-label">{t.search}</span>
      </button>
    </div>
  )
}
