import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import catalog from '../data/catalog.json'
import { mosqueReciters } from '../src/catalog/mosques'

/**
 * Every host the app can ask for audio from has to be one the policy permits.
 *
 * This is the gap that opened when most audio stopped going through the proxy.
 * Before, one host covered everything; now the catalog names four, and a URL
 * whose host is missing from the Content-Security-Policy does not fail loudly —
 * the browser refuses the request and the surah simply never plays.
 *
 * What makes it worth a test rather than a careful eye: `refresh.yml` runs
 * `refresh-catalog.mjs` weekly, unattended, commits `data/catalog.json` to
 * master and then asks the deploy workflow to publish it. The URLs in that file
 * are therefore not reviewed by anybody. If a source moves — a new archive
 * item, an aggregator changing CDN, a `DIRECT` entry added for a host nobody
 * added to the policy — this is the only thing standing between that and a
 * reciter that is silently mute in production.
 *
 * Checked against index.html rather than a copy of the list, because a copy is
 * a second thing to forget.
 */

const html = readFileSync('index.html', 'utf8')

const csp =
  /http-equiv="Content-Security-Policy"\s*\n?\s*content="([^"]*)"/.exec(html)?.[1] ?? ''

/** The host sources of one directive, e.g. `media-src`. */
function hostsOf(directive: string): string[] {
  const found = new RegExp(`${directive}([^;]*);`).exec(csp)?.[1] ?? ''
  return found.trim().split(/\s+/).filter(Boolean)
}

/**
 * Whether a policy list admits a URL's host.
 *
 * `'self'` covers a relative URL and the app's own origin. A `*.` prefix is a
 * suffix match at any label depth, which is what makes `https://*.archive.org`
 * cover the `ia801807.us.archive.org` node that archive.org redirects to — and
 * CSP is enforced on the redirect target, so that matters.
 */
function permits(list: string[], url: string): boolean {
  if (!/^https?:\/\//.test(url)) return list.includes("'self'")
  const host = new URL(url).host
  return list.some((entry) => {
    if (entry === "'self'" || entry === '*') return false
    const bare = entry.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (bare.startsWith('*.')) return host === bare.slice(2) || host.endsWith(bare.slice(1))
    return host === bare
  })
}

/** Every audio URL the app can reach for, from both halves of the catalog. */
function audioUrls(): string[] {
  const out: string[] = []
  for (const r of catalog.reciters) for (const s of r.surahs) out.push(s.url)
  // The mosque years are expanded at load rather than stored, so the file
  // above does not contain them.
  for (const r of mosqueReciters()) for (const s of r.surahs) out.push(s.url)
  return out
}

describe('the policy permits every audio host', () => {
  it('states a policy at all', () => {
    expect(csp, 'no Content-Security-Policy found in index.html').not.toBe('')
    expect(hostsOf('media-src').length).toBeGreaterThan(1)
    expect(hostsOf('connect-src').length).toBeGreaterThan(1)
  })

  // media-src governs the <audio> element, connect-src the ranged fetch the
  // downloader makes. A host missing from either breaks half the app: playing
  // but not saving, or the reverse.
  it.each(['media-src', 'connect-src'])('%s covers every host in the catalog', (directive) => {
    const list = hostsOf(directive)
    const offenders = new Map<string, string>()
    for (const url of audioUrls()) {
      if (permits(list, url)) continue
      const host = /^https?:\/\//.test(url) ? new URL(url).host : '(relative)'
      if (!offenders.has(host)) offenders.set(host, url)
    }
    expect(
      [...offenders.entries()].map(([h, u]) => `${h} — e.g. ${u}`),
      `${directive} does not permit these`,
    ).toEqual([])
  })

  // A guard on the guard: if this ever stops finding URLs it would pass while
  // checking nothing, which is the failure mode a test like this dies of.
  it('actually looked at a realistic number of URLs', () => {
    const urls = audioUrls()
    expect(urls.length).toBeGreaterThan(2000)
    const hosts = new Set(
      urls.filter((u) => /^https?:\/\//.test(u)).map((u) => new URL(u).host),
    )
    expect(hosts.size).toBeGreaterThan(1)
  })
})
