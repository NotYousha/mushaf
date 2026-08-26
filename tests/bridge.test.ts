import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  BRIDGE_VERSION,
  answerNative,
  isNativeShell,
  publishTab,
  type NativeCommand,
} from '../src/native/shell'

beforeEach(() => {
  delete window.MushafNative
})

describe('the bridge in a browser', () => {
  it('is not a native shell', () => {
    expect(isNativeShell()).toBe(false)
  })

  it('publishes into the void without throwing', () => {
    expect(() => publishTab('quran')).not.toThrow()
  })

  it('registers no listener, so a browser pays nothing for this', () => {
    const stop = answerNative({
      catalog: async () => ({}),
      surahs: async () => [],
      command: () => {},
    })
    expect(typeof stop).toBe('function')
    expect(() => stop()).not.toThrow()
  })
})

describe('the bridge inside a shell', () => {
  it('answers a request the shell sends', async () => {
    const sent: string[] = []
    window.MushafNative = { ready: true, postMessage: (m: string) => sent.push(m) }

    const stop = answerNative({
      catalog: async () => ({ reciters: ['barhaji'] }),
      surahs: async () => [1, 2],
      command: () => {},
    })

    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ id: 'r1', kind: 'catalog', v: BRIDGE_VERSION }),
      }),
    )
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(1))

    const reply = JSON.parse(sent[sent.length - 1])
    expect(reply).toMatchObject({ kind: 'reply', payload: { id: 'r1' } })
    expect(reply.payload.result).toEqual({ reciters: ['barhaji'] })
    stop()
  })

  it('announces itself, so a newer shell can stay quiet at an older build', () => {
    const sent: string[] = []
    window.MushafNative = { ready: true, postMessage: (m: string) => sent.push(m) }
    const stop = answerNative({
      catalog: async () => ({}),
      surahs: async () => [],
      command: () => {},
    })
    expect(JSON.parse(sent[0])).toMatchObject({ kind: 'hello', payload: { v: BRIDGE_VERSION } })
    stop()
  })

  it('passes a command through', async () => {
    const got: NativeCommand[] = []
    window.MushafNative = { ready: true, postMessage: () => {} }
    const stop = answerNative({
      catalog: async () => ({}),
      surahs: async () => [],
      command: (c) => got.push(c),
    })

    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          id: 'r2',
          kind: 'command',
          v: BRIDGE_VERSION,
          payload: { verb: 'play', surah: 36, reciterId: 'barhaji' },
        }),
      }),
    )
    await vi.waitFor(() => expect(got).toHaveLength(1))
    expect(got[0]).toMatchObject({ verb: 'play', surah: 36, reciterId: 'barhaji' })
    stop()
  })

  /*
   * The property v1 had and v2 must not lose. An older shell speaking v1, a
   * shell that sends malformed JSON, or one that has stopped listening
   * mid-session must cost the app nothing -- the web app is the thing that has
   * to keep working, and it cannot be taken down by the wrapper around it.
   */
  it('ignores anything it cannot understand rather than throwing', async () => {
    window.MushafNative = { ready: true, postMessage: () => {} }
    const stop = answerNative({
      catalog: async () => {
        throw new Error('catalog is not loaded yet')
      },
      surahs: async () => [],
      command: () => {},
    })

    for (const data of [
      'not json',
      '{}',
      '{"kind":"unknown"}',
      '{"id":"x","kind":"catalog","v":99}',
      'null',
    ]) {
      expect(() => window.dispatchEvent(new MessageEvent('message', { data }))).not.toThrow()
    }

    // And a handler that rejects must not become an unhandled rejection.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ id: 'r3', kind: 'catalog', v: BRIDGE_VERSION }),
      }),
    )
    await new Promise((r) => setTimeout(r, 10))
    stop()
  })

  it('rejects a command whose verb is not one of the five', async () => {
    const got: NativeCommand[] = []
    const sent: string[] = []
    window.MushafNative = { ready: true, postMessage: (m: string) => sent.push(m) }
    const stop = answerNative({
      catalog: async () => ({}),
      surahs: async () => [],
      command: (c) => got.push(c),
    })

    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          id: 'r4',
          kind: 'command',
          v: BRIDGE_VERSION,
          payload: { verb: 'formatDisk' },
        }),
      }),
    )
    expect(got).toHaveLength(0)
    expect(JSON.parse(sent[sent.length - 1]).payload.error).toBe('unrecognised command')
    stop()
  })
})
