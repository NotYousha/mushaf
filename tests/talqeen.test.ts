import { describe, it, expect, vi } from 'vitest'
import { Talqeen } from '../src/player/talqeen'
import { lineSegments, segmentAt, type Layout, type Timings } from '../src/mushaf/data'

/**
 * A media element that only does what Talqeen touches, driven by an explicit
 * clock so a test can step through a line boundary deterministically instead
 * of waiting on real playback.
 */
function fakeEl() {
  const listeners: Record<string, Array<() => void>> = {}
  const el = {
    currentTime: 0,
    muted: false,
    paused: false,
    played: 0,
    play: vi.fn(async () => {
      el.paused = false
      el.played++
    }),
    pause: vi.fn(() => {
      el.paused = true
    }),
    addEventListener: (k: string, f: () => void) => {
      ;(listeners[k] ??= []).push(f)
    },
    removeEventListener: (k: string, f: () => void) => {
      listeners[k] = (listeners[k] ?? []).filter((x) => x !== f)
    },
    /** Move the head, as playback would. */
    advance(to: number) {
      el.currentTime = to
    },
    /** Complete a seek the controller asked for. */
    settle() {
      ;(listeners.seeked ?? []).forEach((f) => f())
    },
  }
  return el
}

const SEGS = [
  { page: 0, line: 1, start: 0, end: 10 },
  { page: 0, line: 2, start: 10, end: 18 },
  { page: 0, line: 3, start: 18, end: 30 },
]

/** Run one tick and let any seek it requested land. */
function step(t: Talqeen, el: ReturnType<typeof fakeEl>, at?: number) {
  if (at !== undefined) el.advance(at)
  t.tick()
  el.settle()
}

describe('Talqeen line segments', () => {
  const layout: Layout = {
    version: 'test',
    pages: [
      [
        { n: 1, w: [['ب', '1:1:1'], ['ج', '1:1:2']] },
        { n: 2, w: [['د', '1:2:1'], ['ه']] },
      ],
      [{ n: 1, w: [['و', '1:3:1']] }],
    ],
  }
  const timings: Timings = {
    unit: 'ms',
    source: 'test',
    surahs: { '1': [[1, [0, 2000]], [2, [5000]], [3, [9000]]] },
  }

  it('turns printed lines into contiguous timed segments', () => {
    const segs = lineSegments(layout, timings, 1, 14)
    expect(segs.map((s) => [s.start, s.end])).toEqual([
      [0, 5],
      [5, 9],
      [9, 14],
    ])
  })

  it('carries the page each line sits on', () => {
    const segs = lineSegments(layout, timings, 1, 14)
    expect(segs.map((s) => s.page)).toEqual([0, 0, 1])
  })

  it('leaves no gap between one line and the next', () => {
    const segs = lineSegments(layout, timings, 1, 14)
    for (let i = 1; i < segs.length; i++) expect(segs[i].start).toBe(segs[i - 1].end)
  })

  it('returns nothing for a reciter with no timings', () => {
    expect(lineSegments(layout, null, 1, 14)).toEqual([])
  })

  it('ignores lines belonging to a different surah', () => {
    const shared: Layout = {
      version: 'test',
      pages: [[{ n: 1, w: [['x', '2:1:1']] }, { n: 2, w: [['ب', '1:1:1']] }]],
    }
    expect(lineSegments(shared, timings, 1, 14)).toHaveLength(1)
  })

  it('finds the segment covering a moment', () => {
    expect(segmentAt(SEGS, 0)).toBe(0)
    expect(segmentAt(SEGS, 9.9)).toBe(0)
    expect(segmentAt(SEGS, 10)).toBe(1)
    expect(segmentAt(SEGS, 29)).toBe(2)
    expect(segmentAt(SEGS, -1)).toBe(-1)
  })
})

describe('Talqeen Mode', () => {
  it('replays the line silently so your turn lasts exactly as long', () => {
    const el = fakeEl()
    const t = new Talqeen({ el: el as unknown as HTMLMediaElement, segments: SEGS })
    t.start()
    expect(t.phase).toBe('listen')
    expect(el.muted).toBe(false)

    step(t, el, 5)
    expect(t.phase).toBe('listen')

    // The line ends: the head goes back to its start and the sound goes off.
    step(t, el, 10)
    expect(t.phase).toBe('echo')
    expect(el.muted).toBe(true)
    expect(el.currentTime).toBe(0)

    // Your turn runs the full length of the line, not a moment less.
    step(t, el, 9.9)
    expect(t.phase).toBe('echo')
    expect(el.muted).toBe(true)

    step(t, el, 10)
    expect(t.phase).toBe('listen')
    expect(el.muted).toBe(false)
    expect(t.index).toBe(1)
  })

  it('never pauses, so a locked phone does not suspend the page', () => {
    const el = fakeEl()
    const t = new Talqeen({ el: el as unknown as HTMLMediaElement, segments: SEGS })
    t.start()
    for (const at of [5, 10, 3, 10, 14, 18, 12, 18]) step(t, el, at)
    expect(el.pause).not.toHaveBeenCalled()
    expect(el.paused).toBe(false)
  })

  it('works through several lines in a row', () => {
    const el = fakeEl()
    const seen: string[] = []
    const t = new Talqeen({
      el: el as unknown as HTMLMediaElement,
      segments: SEGS,
      onState: (s) => seen.push(`${s.index}:${s.phase}`),
    })
    t.start()
    step(t, el, 10) // line 1 done -> echo
    step(t, el, 10) // echo done -> line 2
    step(t, el, 18) // line 2 done -> echo
    step(t, el, 18) // echo done -> line 3
    expect(t.index).toBe(2)
    expect(seen).toEqual(['0:listen', '0:echo', '1:listen', '1:echo', '2:listen'])
  })

  it('picks up on the line the listener scrubbed to', () => {
    const el = fakeEl()
    const t = new Talqeen({ el: el as unknown as HTMLMediaElement, segments: SEGS })
    t.start()
    expect(t.index).toBe(0)
    el.advance(20)
    t.tick()
    expect(t.index).toBe(2)
    expect(t.phase).toBe('listen')
    expect(el.muted).toBe(false)
  })

  it('starts on the line the audio is already in', () => {
    const el = fakeEl()
    el.currentTime = 12
    const t = new Talqeen({ el: el as unknown as HTMLMediaElement, segments: SEGS })
    t.start()
    expect(t.index).toBe(1)
  })

  it('lets you skip your turn and hear the next line', () => {
    const el = fakeEl()
    const t = new Talqeen({ el: el as unknown as HTMLMediaElement, segments: SEGS })
    t.start()
    step(t, el, 10)
    expect(t.phase).toBe('echo')
    t.skipEcho()
    el.settle()
    expect(t.phase).toBe('listen')
    expect(el.muted).toBe(false)
    expect(el.currentTime).toBe(10)
    expect(t.index).toBe(1)
  })

  it('lets you hear the line again instead of reciting it', () => {
    const el = fakeEl()
    const t = new Talqeen({ el: el as unknown as HTMLMediaElement, segments: SEGS })
    t.start()
    step(t, el, 10)
    expect(t.phase).toBe('echo')
    t.repeat()
    el.settle()
    expect(t.phase).toBe('listen')
    expect(el.muted).toBe(false)
    expect(el.currentTime).toBe(0)
    expect(t.index).toBe(0)
  })

  it('gives the last line its turn before the surah is done', () => {
    const el = fakeEl()
    const finished = vi.fn()
    const t = new Talqeen({
      el: el as unknown as HTMLMediaElement,
      segments: SEGS,
      onFinished: finished,
    })
    t.start()
    el.advance(18)
    t.tick() // into line 3
    el.advance(30)

    // Playback stops exactly on the last line's end, so without this the one
    // line that never gets echoed is the last of every surah.
    expect(t.handleEnded()).toBe(true)
    el.settle()
    expect(t.phase).toBe('echo')
    expect(el.muted).toBe(true)
    expect(el.currentTime).toBe(18)
    expect(el.play).toHaveBeenCalled()
    expect(finished).not.toHaveBeenCalled()

    step(t, el, 30)
    expect(finished).toHaveBeenCalledOnce()
    expect(el.muted).toBe(false)
  })

  it('does not take over the ending when it is not running', () => {
    const el = fakeEl()
    const t = new Talqeen({ el: el as unknown as HTMLMediaElement, segments: SEGS })
    expect(t.handleEnded()).toBe(false)
  })

  it('unmutes when switched off mid-turn', () => {
    const el = fakeEl()
    const t = new Talqeen({ el: el as unknown as HTMLMediaElement, segments: SEGS })
    t.start()
    step(t, el, 10)
    expect(el.muted).toBe(true)
    t.stop()
    // Leaving it muted would silence ordinary playback afterwards.
    expect(el.muted).toBe(false)
  })

  it('ignores ticks while a seek has not landed', () => {
    const el = fakeEl()
    const t = new Talqeen({ el: el as unknown as HTMLMediaElement, segments: SEGS })
    t.start()
    el.advance(10)
    t.tick() // asks to seek back to 0; not settled yet
    expect(t.phase).toBe('echo')
    // currentTime still reads past the end until the seek lands. Acting on it
    // would end your turn the instant it began.
    t.tick()
    expect(t.phase).toBe('echo')
    el.settle()
    step(t, el, 1)
    expect(t.phase).toBe('echo')
  })

  it('does nothing without segments', () => {
    const el = fakeEl()
    const t = new Talqeen({ el: el as unknown as HTMLMediaElement, segments: [] })
    t.start()
    step(t, el, 10)
    expect(t.segment).toBeNull()
    expect(el.muted).toBe(false)
  })
})
