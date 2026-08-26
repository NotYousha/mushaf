import { describe, it, expect } from 'vitest'
import { matchShortcut, type KeyLike } from '../src/ui/shortcuts'

const k = (key: string, over: Partial<KeyLike> = {}): KeyLike => ({ key, ...over })

describe('matchShortcut', () => {
  it('binds the transport', () => {
    expect(matchShortcut(k(' '), 'desktop')).toBe('toggle')
    expect(matchShortcut(k('ArrowRight'), 'desktop')).toBe('next')
    expect(matchShortcut(k('ArrowLeft'), 'desktop')).toBe('prev')
    expect(matchShortcut(k(']'), 'desktop')).toBe('ayahNext')
    expect(matchShortcut(k('['), 'desktop')).toBe('ayahPrev')
    expect(matchShortcut(k('g'), 'desktop')).toBe('goto')
    expect(matchShortcut(k('G'), 'desktop')).toBe('goto')
  })

  it('opens the palette on either platform modifier', () => {
    expect(matchShortcut(k('k', { metaKey: true }), 'desktop')).toBe('palette')
    expect(matchShortcut(k('k', { ctrlKey: true }), 'desktop')).toBe('palette')
    expect(matchShortcut(k('K', { metaKey: true }), 'desktop')).toBe('palette')
    // Bare k is not the palette; it is a letter someone might be typing.
    expect(matchShortcut(k('k'), 'desktop')).toBeNull()
  })

  /*
   * The way this feature normally ships broken.
   *
   * The Quran tab has a search field. Without the guard, typing a surah name
   * puts a space in the box and pauses the recitation, and 'g' silently opens
   * a go-to-page prompt in the middle of a word.
   */
  it('never fires while something is being typed into', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(matchShortcut(k(' ', { target: { tagName } }), 'desktop'), tagName).toBeNull()
      expect(matchShortcut(k('g', { target: { tagName } }), 'desktop'), tagName).toBeNull()
      expect(matchShortcut(k('['), 'desktop')).not.toBeNull() // control: it does fire otherwise
    }
    expect(
      matchShortcut(k(' ', { target: { tagName: 'DIV', isContentEditable: true } }), 'desktop'),
    ).toBeNull()
  })

  it('still opens the palette from inside a field, because that is how it is reopened', () => {
    expect(matchShortcut(k('k', { metaKey: true, target: { tagName: 'INPUT' } }), 'desktop')).toBe(
      'palette',
    )
  })

  /*
   * A modifier means the browser's shortcut, not ours. Claiming
   * ctrl+ArrowRight would steal a word-jump; claiming cmd+ArrowLeft would
   * steal Back.
   */
  it('leaves modified keys to the browser', () => {
    expect(matchShortcut(k('ArrowRight', { ctrlKey: true }), 'desktop')).toBeNull()
    expect(matchShortcut(k('ArrowLeft', { metaKey: true }), 'desktop')).toBeNull()
    expect(matchShortcut(k(' ', { altKey: true }), 'desktop')).toBeNull()
    expect(matchShortcut(k('k', { metaKey: true, altKey: true }), 'desktop')).toBeNull()
  })

  /*
   * A television has its own key handling — the arrows move focus there, and a
   * remote has no modifier key at all. Two handlers claiming the arrows is a
   * remote that seeks the audio instead of moving.
   */
  it('claims nothing on a television', () => {
    for (const key of [' ', 'ArrowRight', 'ArrowLeft', '[', ']', 'g']) {
      expect(matchShortcut(k(key), 'tv'), key).toBeNull()
    }
  })

  it('claims nothing on a phone or a tablet, which have no keyboard to claim', () => {
    for (const surface of ['phone', 'tablet', 'native'] as const) {
      expect(matchShortcut(k(' '), surface), surface).toBeNull()
      expect(matchShortcut(k('ArrowRight'), surface), surface).toBeNull()
    }
  })

  /*
   * The palette is the exception to that too: a tablet with a keyboard case is
   * a real thing, and the key costs nothing on a device that cannot send it.
   */
  it('still allows the palette anywhere, since a modifier key implies a keyboard', () => {
    expect(matchShortcut(k('k', { metaKey: true }), 'tablet')).toBe('palette')
  })
})
