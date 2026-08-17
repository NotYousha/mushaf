# Mushaf Offline Quran Player — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An installable PWA that downloads and plays Sheikh Yasser Al-Dosari's Saudi Center mushaf entirely offline, with lock-screen controls, resume-where-you-left-off, and a catalog that grows as new surahs are released.

**Architecture:** Audio blobs live in IndexedDB, fetched via resumable chunked HTTP Range requests from CORS-open archive.org mirrors. An `AudioSource` interface decouples playback from provenance, so catalog downloads and user-imported files are interchangeable. The surah catalog is data — bundled at build time and refreshable from a remote manifest — so newly aired surahs appear without a code change.

**Tech Stack:** Vite, React 18, TypeScript, Vitest, fake-indexeddb, `idb`, vite-plugin-pwa.

## Global Constraints

- **Reciter/mushaf is fixed:** ياسر الدوسري, إنتاج المركز السعودي للتلاوات القرآنية. Never mix in another recording or reciter.
- **37 of 114 surahs released** (1–37 contiguous). Surahs 38–114 render as "not yet released" — never as errors or empty rows.
- **Never fetch `media.altilawat.com` from the browser** — it sends no `Access-Control-Allow-Origin` header. Only `archive.org` URLs are browser-fetchable. `fallbackUrl` in the catalog is for reference and the regeneration script, not for runtime fetch.
- **17 of 37 surahs have `verified: false`** and must be visibly flagged until the user confirms them by ear.
- **Storage is the dominant constraint:** 1.79 GB for the released 37, ~4.5 GB projected at completion. Al-Baqarah alone is 218 MB. Per-surah download is the primary action; "download all" is secondary and gated.
- All UI text supports Arabic (RTL) surah names alongside English.
- Commit after every task.

---

## File Structure

```
data/                        generated + committed, bundled into the app
  catalog.json               37 released surahs: url, bytes, verified
  surahs.json                all 114: names, ayah counts, revelation
  quran-text.json            Uthmani text keyed by surah number
scripts/
  build-catalog.mjs          regenerates catalog.json from source sites
src/
  db/index.ts                IndexedDB open, schema, stores
  db/audio.ts                blob put/get/delete/list
  db/prefs.ts                playback position + settings
  catalog/types.ts           Surah, CatalogEntry, Availability
  catalog/load.ts            bundled catalog + remote refresh + merge
  sources/AudioSource.ts     the interface
  sources/CatalogSource.ts   chunked ranged fetch
  sources/ImportSource.ts    device file import
  sources/matchFilename.ts   filename → surah number (pure)
  download/chunked.ts        resumable ranged fetch
  download/queue.ts          concurrency 3, pause/resume
  storage/quota.ts           estimate + persist
  player/engine.ts           audio element wrapper
  player/mediaSession.ts     lock-screen integration
  player/playQueue.ts        continuous play, repeat, sleep timer
  ui/*.tsx                   screens
tests/                       mirrors src/
```

Each module has one responsibility. `matchFilename`, `chunked`, `queue`, and `playQueue` are pure or near-pure and carry the heaviest test load — they are where bugs hide.

---

### Task 1: Project scaffold and data wiring

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`
- Create: `.gitignore`
- Test: `tests/data.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a running dev server; `data/*.json` importable as typed JSON

- [ ] **Step 1: Scaffold and install**

```bash
cd C:/Users/yoush/mushaf
npm create vite@latest . -- --template react-ts
npm install
npm install idb
npm install -D vitest @vitest/ui jsdom fake-indexeddb vite-plugin-pwa
```

- [ ] **Step 2: Write the failing test**

`tests/data.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import catalog from '../data/catalog.json'
import surahs from '../data/surahs.json'

describe('bundled data', () => {
  it('has 114 surah metadata entries', () => {
    expect(surahs).toHaveLength(114)
    expect(surahs[0].nameEn).toBe('Al-Faatiha')
  })

  it('has 37 released surahs, all archive.org URLs', () => {
    expect(catalog.surahs).toHaveLength(37)
    for (const s of catalog.surahs) {
      expect(s.url).toMatch(/archive\.org/)
      expect(s.surah).toBeGreaterThanOrEqual(1)
      expect(s.surah).toBeLessThanOrEqual(37)
    }
  })

  it('has no duplicate surah numbers', () => {
    const nums = catalog.surahs.map(s => s.surah)
    expect(new Set(nums).size).toBe(nums.length)
  })

  it('flags 17 surahs as unverified', () => {
    expect(catalog.surahs.filter(s => !s.verified)).toHaveLength(17)
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run tests/data.test.ts`
Expected: FAIL — `resolveJsonModule` not enabled, or `nameEn` mismatch.

- [ ] **Step 4: Configure TypeScript and Vitest**

In `tsconfig.json` `compilerOptions`, add:

```json
"resolveJsonModule": true,
"allowSyntheticDefaultImports": true
```

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['./tests/setup.ts'] },
})
```

Create `tests/setup.ts`:

```ts
import 'fake-indexeddb/auto'
```

- [ ] **Step 5: Run tests until green**

Run: `npx vitest run tests/data.test.ts`
Expected: PASS, 4 tests. If `nameEn` differs, read `data/surahs.json` and correct the expected string — do not change the data.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite PWA and wire bundled catalog data"
```

---

### Task 2: Filename matcher

The single highest-bug-density component. A wrong match puts the wrong surah under the wrong name, which is the worst failure this app can have.

**Files:**
- Create: `src/sources/matchFilename.ts`
- Test: `tests/matchFilename.test.ts`

**Interfaces:**
- Consumes: `data/surahs.json`
- Produces: `matchFilename(name: string): number | null` — returns a surah number 1–114, or `null` when unsure.

- [ ] **Step 1: Write the failing test**

`tests/matchFilename.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchFilename } from '../src/sources/matchFilename'

describe('matchFilename', () => {
  it('matches zero-padded numbers', () => {
    expect(matchFilename('001.mp3')).toBe(1)
    expect(matchFilename('018.mp3')).toBe(18)
    expect(matchFilename('114.mp3')).toBe(114)
  })

  it('matches bare numbers', () => {
    expect(matchFilename('7.mp3')).toBe(7)
    expect(matchFilename('36.m4a')).toBe(36)
  })

  it('matches numbered titles', () => {
    expect(matchFilename('01 - Al-Fatiha.mp3')).toBe(1)
    expect(matchFilename('18_Al-Kahf.mp3')).toBe(18)
  })

  it('matches English names', () => {
    expect(matchFilename('Al-Kahf.mp3')).toBe(18)
    expect(matchFilename('yaseen.mp3')).toBe(36)
  })

  it('matches Arabic names', () => {
    expect(matchFilename('الكهف.mp3')).toBe(18)
    expect(matchFilename('سورة يس.mp3')).toBe(36)
  })

  it('returns null rather than guessing', () => {
    expect(matchFilename('track01-unknown.mp3')).toBe(null)
    expect(matchFilename('recording.mp3')).toBe(null)
    expect(matchFilename('0.mp3')).toBe(null)
    expect(matchFilename('115.mp3')).toBe(null)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/matchFilename.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/sources/matchFilename.ts`:

```ts
import surahs from '../../data/surahs.json'

const strip = (s: string) =>
  s.replace(/\.[a-z0-9]+$/i, '')
   .replace(/[\u064B-\u0652\u0670]/g, '')   // Arabic diacritics
   .replace(/[ـ_\-()[\]]/g, ' ')
   .replace(/\s+/g, ' ')
   .trim()
   .toLowerCase()

const normalizeAr = (s: string) =>
  s.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
   .replace(/^سوره\s*/, '')

export function matchFilename(filename: string): number | null {
  const base = strip(filename)

  // 1. leading or standalone number
  const num = base.match(/^(\d{1,3})(?:\s|$)/)
  if (num) {
    const n = parseInt(num[1], 10)
    if (n >= 1 && n <= 114) return n
  }

  // 2. Arabic name
  const ar = normalizeAr(base)
  for (const s of surahs) {
    const name = normalizeAr(strip(s.name))
    if (name && (ar === name || ar.includes(name))) return s.surah
  }

  // 3. English name, punctuation-insensitive
  const flat = base.replace(/[^a-z]/g, '')
  if (flat.length >= 3) {
    for (const s of surahs) {
      const en = s.nameEn.toLowerCase().replace(/[^a-z]/g, '')
      if (flat === en || flat.endsWith(en) || flat.startsWith(en)) return s.surah
    }
  }

  return null
}
```

- [ ] **Step 4: Run until green**

Run: `npx vitest run tests/matchFilename.test.ts`
Expected: PASS, 6 tests. If `yaseen` fails, check `nameEn` in `data/surahs.json` (likely `Yaseen`) and extend the English branch with a small alias map rather than loosening the matching.

- [ ] **Step 5: Commit**

```bash
git add src/sources/matchFilename.ts tests/matchFilename.test.ts
git commit -m "feat: filename to surah matcher with null-on-uncertain"
```

---

### Task 3: IndexedDB storage layer

**Files:**
- Create: `src/db/index.ts`, `src/db/audio.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `getDB(): Promise<IDBPDatabase>`
  - `putAudio(surah: number, blob: Blob, sourceId: string): Promise<void>`
  - `getAudio(surah: number): Promise<Blob | null>`
  - `deleteAudio(surah: number): Promise<void>`
  - `listDownloaded(): Promise<Array<{surah: number, bytes: number, sourceId: string}>>`

- [ ] **Step 1: Write the failing test**

`tests/db.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { putAudio, getAudio, deleteAudio, listDownloaded } from '../src/db/audio'

describe('audio store', () => {
  beforeEach(async () => {
    for (const e of await listDownloaded()) await deleteAudio(e.surah)
  })

  it('round-trips a blob', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' })
    await putAudio(18, blob, 'catalog')
    const got = await getAudio(18)
    expect(got).not.toBeNull()
    expect(got!.size).toBe(3)
  })

  it('returns null for a surah that was never stored', async () => {
    expect(await getAudio(99)).toBeNull()
  })

  it('lists what is downloaded with sizes', async () => {
    await putAudio(1, new Blob([new Uint8Array(10)]), 'catalog')
    await putAudio(2, new Blob([new Uint8Array(20)]), 'import')
    const list = await listDownloaded()
    expect(list).toHaveLength(2)
    expect(list.find(e => e.surah === 2)!.bytes).toBe(20)
    expect(list.find(e => e.surah === 2)!.sourceId).toBe('import')
  })

  it('deletes', async () => {
    await putAudio(5, new Blob([new Uint8Array(4)]), 'catalog')
    await deleteAudio(5)
    expect(await getAudio(5)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the database**

`src/db/index.ts`:

```ts
import { openDB, type IDBPDatabase } from 'idb'

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB('mushaf', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio')
        if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs')
        if (!db.objectStoreNames.contains('partial')) db.createObjectStore('partial')
      },
    })
  }
  return dbPromise
}
```

`src/db/audio.ts`:

```ts
import { getDB } from './index'

type Record = { blob: Blob; sourceId: string; storedAt: number }

export async function putAudio(surah: number, blob: Blob, sourceId: string) {
  const db = await getDB()
  await db.put('audio', { blob, sourceId, storedAt: Date.now() } as Record, surah)
}

export async function getAudio(surah: number): Promise<Blob | null> {
  const db = await getDB()
  const rec = (await db.get('audio', surah)) as Record | undefined
  return rec?.blob ?? null
}

export async function deleteAudio(surah: number) {
  const db = await getDB()
  await db.delete('audio', surah)
}

export async function listDownloaded() {
  const db = await getDB()
  const keys = await db.getAllKeys('audio')
  const vals = (await db.getAll('audio')) as Record[]
  return keys.map((k, i) => ({
    surah: Number(k),
    bytes: vals[i].blob.size,
    sourceId: vals[i].sourceId,
  }))
}
```

- [ ] **Step 4: Run until green**

Run: `npx vitest run tests/db.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/db tests/db.test.ts
git commit -m "feat: IndexedDB audio blob store"
```

---

### Task 4: Catalog loading and availability

**Files:**
- Create: `src/catalog/types.ts`, `src/catalog/load.ts`
- Test: `tests/catalog.test.ts`

**Interfaces:**
- Consumes: `data/catalog.json`, `data/surahs.json`
- Produces:
  - `type SurahView = { surah: number; name: string; nameEn: string; ayahs: number; released: boolean; verified: boolean; url: string | null; bytes: number }`
  - `buildView(catalog, meta): SurahView[]` — always 114 entries
  - `loadCatalog(remoteUrl?: string): Promise<SurahView[]>` — remote refresh, silent fallback to bundled

- [ ] **Step 1: Write the failing test**

`tests/catalog.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { buildView, loadCatalog } from '../src/catalog/load'
import catalog from '../data/catalog.json'
import meta from '../data/surahs.json'

describe('catalog view', () => {
  it('always returns all 114 surahs', () => {
    const v = buildView(catalog as any, meta as any)
    expect(v).toHaveLength(114)
  })

  it('marks 1-37 released and 38+ unreleased', () => {
    const v = buildView(catalog as any, meta as any)
    expect(v.find(s => s.surah === 18)!.released).toBe(true)
    expect(v.find(s => s.surah === 67)!.released).toBe(false)
    expect(v.find(s => s.surah === 67)!.url).toBe(null)
  })

  it('carries verified flags through', () => {
    const v = buildView(catalog as any, meta as any)
    expect(v.filter(s => s.released && !s.verified)).toHaveLength(17)
  })

  it('falls back to bundled catalog when remote fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const v = await loadCatalog('https://example.com/catalog.json')
    expect(v).toHaveLength(114)
    expect(v.filter(s => s.released)).toHaveLength(37)
    vi.unstubAllGlobals()
  })

  it('uses remote catalog when it has more surahs', async () => {
    const remote = { ...catalog, released: 38,
      surahs: [...catalog.surahs, { surah: 38, name: 'ص', url: 'https://archive.org/download/x/38.mp3', bytes: 100, verified: true }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => remote }))
    const v = await loadCatalog('https://example.com/catalog.json')
    expect(v.filter(s => s.released)).toHaveLength(38)
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/catalog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/catalog/types.ts`:

```ts
export type CatalogEntry = {
  surah: number; name: string; url: string
  fallbackUrl?: string | null; bytes: number; verified: boolean
}
export type Catalog = {
  reciter: string; mushaf: string; released: number; total: number
  surahs: CatalogEntry[]
}
export type SurahMeta = {
  surah: number; name: string; nameEn: string
  translation: string; ayahs: number; revelation: string
}
export type SurahView = {
  surah: number; name: string; nameEn: string; ayahs: number
  released: boolean; verified: boolean; url: string | null; bytes: number
}
```

`src/catalog/load.ts`:

```ts
import bundled from '../../data/catalog.json'
import meta from '../../data/surahs.json'
import type { Catalog, SurahMeta, SurahView } from './types'

export function buildView(cat: Catalog, m: SurahMeta[]): SurahView[] {
  const byNum = new Map(cat.surahs.map(s => [s.surah, s]))
  return m.map(md => {
    const e = byNum.get(md.surah)
    return {
      surah: md.surah,
      name: md.name,
      nameEn: md.nameEn,
      ayahs: md.ayahs,
      released: !!e,
      verified: e?.verified ?? false,
      url: e?.url ?? null,
      bytes: e?.bytes ?? 0,
    }
  })
}

export async function loadCatalog(remoteUrl?: string): Promise<SurahView[]> {
  let cat = bundled as unknown as Catalog
  if (remoteUrl) {
    try {
      const res = await fetch(remoteUrl, { cache: 'no-cache' })
      if (res.ok) {
        const remote = (await res.json()) as Catalog
        // Only accept a remote catalog that is a superset — never lose surahs.
        if (Array.isArray(remote.surahs) && remote.surahs.length >= cat.surahs.length) {
          cat = remote
        }
      }
    } catch {
      // offline or unreachable — bundled catalog stands
    }
  }
  return buildView(cat, meta as SurahMeta[])
}
```

- [ ] **Step 4: Run until green**

Run: `npx vitest run tests/catalog.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/catalog tests/catalog.test.ts
git commit -m "feat: catalog view with remote refresh and superset guard"
```

---

### Task 5: Resumable chunked download

Al-Baqarah is 218 MB. A single-shot fetch that large fails routinely on mobile, so this is load-bearing.

**Files:**
- Create: `src/download/chunked.ts`
- Test: `tests/chunked.test.ts`

**Interfaces:**
- Consumes: `db/index.ts` (`partial` store)
- Produces: `downloadChunked(url, opts): Promise<Blob>` where
  `opts = { chunkSize?: number; onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal; key?: string }`

- [ ] **Step 1: Write the failing test**

`tests/chunked.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { downloadChunked } from '../src/download/chunked'

function rangeServer(total: number, failAt?: number) {
  let calls = 0
  return vi.fn(async (url: string, init: any) => {
    calls++
    if (failAt && calls === failAt) throw new Error('network')
    const m = /bytes=(\d+)-(\d+)/.exec(init.headers.Range)
    const start = +m![1], end = Math.min(+m![2], total - 1)
    const body = new Uint8Array(end - start + 1).fill(7)
    return {
      ok: true, status: 206,
      headers: { get: (h: string) => h.toLowerCase() === 'content-range' ? `bytes ${start}-${end}/${total}` : null },
      arrayBuffer: async () => body.buffer,
    }
  })
}

describe('downloadChunked', () => {
  it('assembles a file from multiple chunks', async () => {
    vi.stubGlobal('fetch', rangeServer(2500))
    const blob = await downloadChunked('https://x/y.mp3', { chunkSize: 1000 })
    expect(blob.size).toBe(2500)
    vi.unstubAllGlobals()
  })

  it('reports progress up to the total', async () => {
    vi.stubGlobal('fetch', rangeServer(3000))
    const seen: number[] = []
    await downloadChunked('https://x/y.mp3', { chunkSize: 1000, onProgress: l => seen.push(l) })
    expect(seen[seen.length - 1]).toBe(3000)
    vi.unstubAllGlobals()
  })

  it('propagates a network failure instead of returning a short file', async () => {
    vi.stubGlobal('fetch', rangeServer(3000, 2))
    await expect(downloadChunked('https://x/y.mp3', { chunkSize: 1000 })).rejects.toThrow('network')
    vi.unstubAllGlobals()
  })

  it('aborts when signalled', async () => {
    vi.stubGlobal('fetch', rangeServer(10000))
    const ac = new AbortController()
    const p = downloadChunked('https://x/y.mp3', { chunkSize: 1000, signal: ac.signal })
    ac.abort()
    await expect(p).rejects.toThrow(/abort/i)
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/chunked.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/download/chunked.ts`:

```ts
export type ChunkedOpts = {
  chunkSize?: number
  onProgress?: (loaded: number, total: number) => void
  signal?: AbortSignal
}

const DEFAULT_CHUNK = 2 * 1024 * 1024 // 2 MB

export async function downloadChunked(url: string, opts: ChunkedOpts = {}): Promise<Blob> {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK
  const parts: BlobPart[] = []
  let offset = 0
  let total = Infinity

  while (offset < total) {
    if (opts.signal?.aborted) throw new Error('aborted')
    const end = offset + chunkSize - 1
    const res = await fetch(url, {
      headers: { Range: `bytes=${offset}-${end}` },
      signal: opts.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const cr = res.headers.get('content-range')
    if (cr) {
      const t = /\/(\d+)$/.exec(cr)
      if (t) total = parseInt(t[1], 10)
    }

    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0) break
    parts.push(buf)
    offset += buf.byteLength
    opts.onProgress?.(Math.min(offset, total), total)
  }

  if (total !== Infinity && offset !== total) {
    throw new Error(`incomplete: got ${offset} of ${total}`)
  }
  return new Blob(parts, { type: 'audio/mpeg' })
}
```

- [ ] **Step 4: Run until green**

Run: `npx vitest run tests/chunked.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/download/chunked.ts tests/chunked.test.ts
git commit -m "feat: resumable chunked range download"
```

---

### Task 6: Download queue

**Files:**
- Create: `src/download/queue.ts`
- Test: `tests/queue.test.ts`

**Interfaces:**
- Consumes: `downloadChunked`, `putAudio`
- Produces: `class DownloadQueue` with
  `enqueue(surah: number, url: string): void`,
  `cancel(surah: number): void`,
  `pauseAll(): void`, `resumeAll(): void`,
  `subscribe(fn: (state: QueueState) => void): () => void`,
  `type QueueState = { active: number[]; pending: number[]; progress: Record<number, number>; failed: Record<number, string> }`

- [ ] **Step 1: Write the failing test**

`tests/queue.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DownloadQueue } from '../src/download/queue'

const deferred = () => { let r: any, j: any; const p = new Promise((a, b) => { r = a; j = b }); return { p, r, j } }

describe('DownloadQueue', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('runs at most 3 downloads concurrently', async () => {
    const gates = Array.from({ length: 5 }, deferred)
    let started = 0
    const fetcher = vi.fn(async () => { const g = gates[started++]; await g.p; return new Blob([new Uint8Array(1)]) })
    const q = new DownloadQueue({ fetcher, save: async () => {} })
    for (let i = 1; i <= 5; i++) q.enqueue(i, `u${i}`)
    await Promise.resolve()
    expect(started).toBe(3)
    gates[0].r(); gates[1].r(); gates[2].r()
    await new Promise(r => setTimeout(r, 0))
    expect(started).toBe(5)
    gates[3].r(); gates[4].r()
  })

  it('records failures without stopping the queue', async () => {
    const fetcher = vi.fn(async (surah: number) => {
      if (surah === 1) throw new Error('boom')
      return new Blob([new Uint8Array(1)])
    })
    const q = new DownloadQueue({ fetcher, save: async () => {} })
    q.enqueue(1, 'a'); q.enqueue(2, 'b')
    await q.drain()
    expect(q.state().failed[1]).toContain('boom')
    expect(q.state().failed[2]).toBeUndefined()
  })

  it('saves the blob for a completed download', async () => {
    const saved: number[] = []
    const q = new DownloadQueue({
      fetcher: async () => new Blob([new Uint8Array(3)]),
      save: async (surah) => { saved.push(surah) },
    })
    q.enqueue(9, 'u')
    await q.drain()
    expect(saved).toEqual([9])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/queue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/download/queue.ts`:

```ts
export type QueueState = {
  active: number[]; pending: number[]
  progress: Record<number, number>; failed: Record<number, string>
}

type Deps = {
  fetcher: (surah: number, url: string, onProgress: (l: number, t: number) => void, signal: AbortSignal) => Promise<Blob>
  save: (surah: number, blob: Blob) => Promise<void>
  concurrency?: number
}

export class DownloadQueue {
  private pending: Array<{ surah: number; url: string }> = []
  private active = new Map<number, AbortController>()
  private progress: Record<number, number> = {}
  private failed: Record<number, string> = {}
  private paused = false
  private subs = new Set<(s: QueueState) => void>()
  private running: Promise<void>[] = []
  private limit: number

  constructor(private deps: Deps) { this.limit = deps.concurrency ?? 3 }

  state(): QueueState {
    return {
      active: [...this.active.keys()], pending: this.pending.map(p => p.surah),
      progress: { ...this.progress }, failed: { ...this.failed },
    }
  }

  subscribe(fn: (s: QueueState) => void) { this.subs.add(fn); return () => this.subs.delete(fn) }
  private emit() { const s = this.state(); this.subs.forEach(f => f(s)) }

  enqueue(surah: number, url: string) {
    if (this.active.has(surah) || this.pending.some(p => p.surah === surah)) return
    delete this.failed[surah]
    this.pending.push({ surah, url })
    this.pump()
  }

  cancel(surah: number) {
    this.active.get(surah)?.abort()
    this.pending = this.pending.filter(p => p.surah !== surah)
    this.emit()
  }

  pauseAll() { this.paused = true; this.active.forEach(c => c.abort()) }
  resumeAll() { this.paused = false; this.pump() }

  private pump() {
    while (!this.paused && this.active.size < this.limit && this.pending.length) {
      const job = this.pending.shift()!
      const ac = new AbortController()
      this.active.set(job.surah, ac)
      const task = (async () => {
        try {
          const blob = await this.deps.fetcher(job.surah, job.url,
            (l, t) => { this.progress[job.surah] = t ? l / t : 0; this.emit() }, ac.signal)
          await this.deps.save(job.surah, blob)
        } catch (e: any) {
          this.failed[job.surah] = String(e?.message ?? e)
        } finally {
          this.active.delete(job.surah)
          delete this.progress[job.surah]
          this.emit()
          this.pump()
        }
      })()
      this.running.push(task)
    }
    this.emit()
  }

  async drain() {
    while (this.running.length) {
      const batch = this.running
      this.running = []
      await Promise.all(batch)
    }
  }
}
```

- [ ] **Step 4: Run until green**

Run: `npx vitest run tests/queue.test.ts`
Expected: PASS, 3 tests. The concurrency test depends on microtask timing — if `started` reads 0, add `await new Promise(r => setTimeout(r, 0))` before the assertion rather than raising the limit.

- [ ] **Step 5: Commit**

```bash
git add src/download/queue.ts tests/queue.test.ts
git commit -m "feat: download queue with concurrency 3 and failure isolation"
```

---

### Task 7: Storage quota

**Files:**
- Create: `src/storage/quota.ts`
- Test: `tests/quota.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `getQuota(): Promise<{ usage: number; quota: number; free: number }>`
  - `requestPersistence(): Promise<boolean>`
  - `canDownloadAll(catalogBytes: number, free: number): boolean` — requires `free > catalogBytes * 1.25`

- [ ] **Step 1: Write the failing test**

`tests/quota.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { getQuota, canDownloadAll } from '../src/storage/quota'

describe('quota', () => {
  it('gates download-all at 1.25x the catalog size', () => {
    const cat = 1_000_000_000
    expect(canDownloadAll(cat, 1_300_000_000)).toBe(true)
    expect(canDownloadAll(cat, 1_200_000_000)).toBe(false)
  })

  it('reports free space', async () => {
    vi.stubGlobal('navigator', { storage: { estimate: async () => ({ usage: 100, quota: 500 }) } })
    expect(await getQuota()).toEqual({ usage: 100, quota: 500, free: 400 })
    vi.unstubAllGlobals()
  })

  it('degrades gracefully when the API is missing', async () => {
    vi.stubGlobal('navigator', {})
    const q = await getQuota()
    expect(q.quota).toBe(0)
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/quota.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/storage/quota.ts`:

```ts
export async function getQuota() {
  const st = (navigator as any)?.storage
  if (!st?.estimate) return { usage: 0, quota: 0, free: 0 }
  const { usage = 0, quota = 0 } = await st.estimate()
  return { usage, quota, free: Math.max(0, quota - usage) }
}

export async function requestPersistence(): Promise<boolean> {
  const st = (navigator as any)?.storage
  if (!st?.persist) return false
  try { return await st.persist() } catch { return false }
}

export function canDownloadAll(catalogBytes: number, free: number): boolean {
  return free > catalogBytes * 1.25
}
```

- [ ] **Step 4: Run until green**

Run: `npx vitest run tests/quota.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/storage tests/quota.test.ts
git commit -m "feat: storage quota reporting and download-all gate"
```

---

### Task 8: Player engine and resume

**Files:**
- Create: `src/player/engine.ts`, `src/db/prefs.ts`
- Test: `tests/player.test.ts`

**Interfaces:**
- Consumes: `getAudio`, `getDB`
- Produces:
  - `savePosition(surah: number, seconds: number): Promise<void>`, `loadPosition(): Promise<{surah: number, seconds: number} | null>`
  - `class PlayerEngine` with `load(surah)`, `play()`, `pause()`, `seek(s)`, `on(event, fn)`

- [ ] **Step 1: Write the failing test**

`tests/player.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { savePosition, loadPosition } from '../src/db/prefs'

describe('resume position', () => {
  it('starts with no saved position', async () => {
    expect(await loadPosition()).toBe(null)
  })

  it('round-trips the last position', async () => {
    await savePosition(18, 123.5)
    expect(await loadPosition()).toEqual({ surah: 18, seconds: 123.5 })
  })

  it('overwrites rather than accumulating', async () => {
    await savePosition(2, 10)
    await savePosition(3, 20)
    expect(await loadPosition()).toEqual({ surah: 3, seconds: 20 })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/player.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement prefs**

`src/db/prefs.ts`:

```ts
import { getDB } from './index'

const KEY = 'lastPosition'

export async function savePosition(surah: number, seconds: number) {
  const db = await getDB()
  await db.put('prefs', { surah, seconds }, KEY)
}

export async function loadPosition(): Promise<{ surah: number; seconds: number } | null> {
  const db = await getDB()
  return (await db.get('prefs', KEY)) ?? null
}

export async function setPref<T>(key: string, value: T) {
  const db = await getDB(); await db.put('prefs', value, key)
}
export async function getPref<T>(key: string, fallback: T): Promise<T> {
  const db = await getDB(); return (await db.get('prefs', key)) ?? fallback
}
```

- [ ] **Step 4: Implement the engine**

`src/player/engine.ts`:

```ts
import { getAudio } from '../db/audio'
import { savePosition } from '../db/prefs'

type Events = 'ended' | 'timeupdate' | 'play' | 'pause' | 'error'

export class PlayerEngine {
  readonly el = new Audio()
  private url: string | null = null
  private currentSurah: number | null = null
  private lastSaved = 0

  constructor() {
    this.el.addEventListener('timeupdate', () => {
      const t = this.el.currentTime
      if (this.currentSurah && t - this.lastSaved > 5) {
        this.lastSaved = t
        void savePosition(this.currentSurah, t)
      }
    })
    const flush = () => {
      if (this.currentSurah) void savePosition(this.currentSurah, this.el.currentTime)
    }
    this.el.addEventListener('pause', flush)
    document.addEventListener('visibilitychange', flush)
  }

  /** Returns false when the blob is absent — caller should offer a re-download. */
  async load(surah: number, startAt = 0): Promise<boolean> {
    const blob = await getAudio(surah)
    if (!blob) return false
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = URL.createObjectURL(blob)
    this.currentSurah = surah
    this.lastSaved = startAt
    this.el.src = this.url
    this.el.currentTime = startAt
    return true
  }

  play() { return this.el.play() }
  pause() { this.el.pause() }
  seek(s: number) { this.el.currentTime = s }
  get surah() { return this.currentSurah }
  on(e: Events, fn: () => void) { this.el.addEventListener(e, fn); return () => this.el.removeEventListener(e, fn) }
}
```

- [ ] **Step 5: Run until green**

Run: `npx vitest run tests/player.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/player/engine.ts src/db/prefs.ts tests/player.test.ts
git commit -m "feat: player engine with throttled resume persistence"
```

---

### Task 9: Play queue — continuous play, repeat, sleep timer

**Files:**
- Create: `src/player/playQueue.ts`
- Test: `tests/playQueue.test.ts`

**Interfaces:**
- Consumes: `SurahView[]`
- Produces: `nextSurah(current, mode, available): number | null` where `mode: 'off' | 'one' | 'all'`

- [ ] **Step 1: Write the failing test**

`tests/playQueue.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { nextSurah } from '../src/player/playQueue'

const available = [1, 2, 3, 18, 36, 37]

describe('nextSurah', () => {
  it('advances to the next available surah, skipping unreleased', () => {
    expect(nextSurah(3, 'off', available)).toBe(18)
  })
  it('repeat-one returns the same surah', () => {
    expect(nextSurah(18, 'one', available)).toBe(18)
  })
  it('stops at the end when repeat is off', () => {
    expect(nextSurah(37, 'off', available)).toBe(null)
  })
  it('repeat-all wraps to the first', () => {
    expect(nextSurah(37, 'all', available)).toBe(1)
  })
  it('returns null when nothing is available', () => {
    expect(nextSurah(1, 'all', [])).toBe(null)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/playQueue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/player/playQueue.ts`:

```ts
export type RepeatMode = 'off' | 'one' | 'all'

export function nextSurah(current: number, mode: RepeatMode, available: number[]): number | null {
  if (!available.length) return null
  if (mode === 'one') return current
  const sorted = [...available].sort((a, b) => a - b)
  const next = sorted.find(s => s > current)
  if (next !== undefined) return next
  return mode === 'all' ? sorted[0] : null
}
```

- [ ] **Step 4: Run until green**

Run: `npx vitest run tests/playQueue.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/player/playQueue.ts tests/playQueue.test.ts
git commit -m "feat: continuous play and repeat modes"
```

---

### Task 10: Media Session lock-screen controls

**Files:**
- Create: `src/player/mediaSession.ts`
- Modify: `src/player/engine.ts` — call `updateMediaSession` from `load()`
- Test: `tests/mediaSession.test.ts`

**Interfaces:**
- Consumes: `SurahView`
- Produces: `updateMediaSession(surah: SurahView, handlers: { next: () => void; prev: () => void; seek: (t: number) => void }): void`

- [ ] **Step 1: Write the failing test**

`tests/mediaSession.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { updateMediaSession } from '../src/player/mediaSession'

describe('media session', () => {
  it('sets metadata and handlers', () => {
    const setActionHandler = vi.fn()
    vi.stubGlobal('navigator', { mediaSession: { setActionHandler, metadata: null } })
    vi.stubGlobal('MediaMetadata', class { constructor(public init: any) {} })
    updateMediaSession(
      { surah: 18, name: 'الكهف', nameEn: 'Al-Kahf', ayahs: 110, released: true, verified: true, url: 'u', bytes: 1 },
      { next: () => {}, prev: () => {}, seek: () => {} }
    )
    const actions = setActionHandler.mock.calls.map(c => c[0])
    expect(actions).toContain('nexttrack')
    expect(actions).toContain('previoustrack')
    vi.unstubAllGlobals()
  })

  it('does nothing when the API is unavailable', () => {
    vi.stubGlobal('navigator', {})
    expect(() => updateMediaSession(
      { surah: 1, name: 'ا', nameEn: 'A', ayahs: 7, released: true, verified: true, url: 'u', bytes: 1 },
      { next: () => {}, prev: () => {}, seek: () => {} }
    )).not.toThrow()
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/mediaSession.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/player/mediaSession.ts`:

```ts
import type { SurahView } from '../catalog/types'

export function updateMediaSession(
  s: SurahView,
  h: { next: () => void; prev: () => void; seek: (t: number) => void }
) {
  const ms = (navigator as any)?.mediaSession
  if (!ms) return
  try {
    ms.metadata = new (globalThis as any).MediaMetadata({
      title: `${s.name} · ${s.nameEn}`,
      artist: 'ياسر الدوسري',
      album: 'المركز السعودي للتلاوات القرآنية',
      artwork: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
    })
    ms.setActionHandler('nexttrack', h.next)
    ms.setActionHandler('previoustrack', h.prev)
    ms.setActionHandler('seekto', (d: any) => h.seek(d.seekTime))
  } catch {
    // metadata is best-effort; playback must not depend on it
  }
}
```

- [ ] **Step 4: Wire it into the engine**

In `src/player/engine.ts`, add an optional callback invoked at the end of `load()`:

```ts
  onLoaded?: (surah: number) => void
```

and call `this.onLoaded?.(surah)` immediately before `return true`.

- [ ] **Step 5: Run until green**

Run: `npx vitest run tests/mediaSession.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add src/player/mediaSession.ts src/player/engine.ts tests/mediaSession.test.ts
git commit -m "feat: lock-screen controls via Media Session API"
```

---

### Task 11: Catalog source and import source

**Files:**
- Create: `src/sources/AudioSource.ts`, `src/sources/CatalogSource.ts`, `src/sources/ImportSource.ts`
- Test: `tests/sources.test.ts`

**Interfaces:**
- Consumes: `downloadChunked`, `matchFilename`
- Produces:
  - `interface AudioSource { id: string; name: string; fetchSurah(n, onProgress, signal): Promise<Blob> }`
  - `importFiles(files: File[]): Promise<{ matched: Array<{surah: number, file: File}>; unmatched: File[] }>`

- [ ] **Step 1: Write the failing test**

`tests/sources.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { importFiles } from '../src/sources/ImportSource'
import { CatalogSource } from '../src/sources/CatalogSource'

const f = (name: string) => new File([new Uint8Array(2)], name)

describe('importFiles', () => {
  it('splits matched from unmatched', async () => {
    const r = await importFiles([f('018.mp3'), f('Al-Kahf.mp3'), f('mystery.mp3')])
    expect(r.matched.map(m => m.surah)).toEqual([18, 18])
    expect(r.unmatched.map(u => u.name)).toEqual(['mystery.mp3'])
  })
})

describe('CatalogSource', () => {
  it('refuses non-archive.org URLs', async () => {
    const src = new CatalogSource(new Map([[2, 'https://media.altilawat.com/x.mp3']]))
    await expect(src.fetchSurah(2, () => {}, new AbortController().signal)).rejects.toThrow(/CORS|archive/i)
  })

  it('throws a clear error for an unreleased surah', async () => {
    const src = new CatalogSource(new Map())
    await expect(src.fetchSurah(99, () => {}, new AbortController().signal)).rejects.toThrow(/not released/i)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/sources.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/sources/AudioSource.ts`:

```ts
export interface AudioSource {
  id: string
  name: string
  fetchSurah(surah: number, onProgress: (l: number, t: number) => void, signal: AbortSignal): Promise<Blob>
}
```

`src/sources/CatalogSource.ts`:

```ts
import { downloadChunked } from '../download/chunked'
import type { AudioSource } from './AudioSource'

export class CatalogSource implements AudioSource {
  id = 'catalog'
  name = 'المركز السعودي للتلاوات القرآنية'
  constructor(private urls: Map<number, string>) {}

  async fetchSurah(surah: number, onProgress: (l: number, t: number) => void, signal: AbortSignal) {
    const url = this.urls.get(surah)
    if (!url) throw new Error(`Surah ${surah} is not released yet`)
    // Guard: only archive.org sends CORS headers. Anything else fails opaquely in the browser.
    if (!/(^|\.)archive\.org\//.test(url)) {
      throw new Error(`Refusing non-archive.org URL (CORS-blocked): ${url}`)
    }
    return downloadChunked(url, { onProgress, signal })
  }
}
```

`src/sources/ImportSource.ts`:

```ts
import { matchFilename } from './matchFilename'

export async function importFiles(files: File[]) {
  const matched: Array<{ surah: number; file: File }> = []
  const unmatched: File[] = []
  for (const file of files) {
    const n = matchFilename(file.name)
    if (n) matched.push({ surah: n, file })
    else unmatched.push(file)
  }
  return { matched, unmatched }
}
```

- [ ] **Step 4: Run until green**

Run: `npx vitest run tests/sources.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sources tests/sources.test.ts
git commit -m "feat: catalog and import audio sources behind one interface"
```

---

### Task 12: Surah list screen

**Files:**
- Create: `src/ui/SurahList.tsx`, `src/ui/format.ts`
- Modify: `src/App.tsx`
- Test: `tests/format.test.ts`

**Interfaces:**
- Consumes: `SurahView[]`, `DownloadQueue`
- Produces: `formatBytes(n: number): string`; `<SurahList surahs onPlay onDownload downloaded progress />`

- [ ] **Step 1: Write the failing test**

`tests/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatBytes } from '../src/ui/format'

describe('formatBytes', () => {
  it('formats MB and GB', () => {
    expect(formatBytes(1_048_576)).toBe('1 MB')
    expect(formatBytes(228_582_855)).toBe('218 MB')
    expect(formatBytes(1_921_000_000)).toBe('1.79 GB')
  })
  it('handles zero', () => {
    expect(formatBytes(0)).toBe('—')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/format.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the formatter**

`src/ui/format.ts`:

```ts
export function formatBytes(n: number): string {
  if (!n) return '—'
  const mb = n / 1_048_576
  if (mb < 1024) return `${Math.round(mb)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}
```

- [ ] **Step 4: Run until green**

Run: `npx vitest run tests/format.test.ts`
Expected: PASS, 2 tests. If `1.79 GB` reads `1.79` vs `1.79`, keep two decimals — the storage figures in this app are meaningful to the user.

- [ ] **Step 5: Build the list component**

`src/ui/SurahList.tsx`:

```tsx
import type { SurahView } from '../catalog/types'
import { formatBytes } from './format'

type Props = {
  surahs: SurahView[]
  downloaded: Set<number>
  progress: Record<number, number>
  onPlay: (surah: number) => void
  onDownload: (surah: number) => void
}

export function SurahList({ surahs, downloaded, progress, onPlay, onDownload }: Props) {
  return (
    <ul className="surah-list">
      {surahs.map(s => {
        const have = downloaded.has(s.surah)
        const pct = progress[s.surah]
        return (
          <li key={s.surah} className={s.released ? 'released' : 'unreleased'}>
            <span className="num">{s.surah}</span>
            <span className="names">
              <span className="ar" dir="rtl">{s.name}</span>
              <span className="en">{s.nameEn} · {s.ayahs} ayahs</span>
            </span>
            {!s.released && <span className="badge">not yet released</span>}
            {s.released && !s.verified && <span className="badge warn">unverified</span>}
            {s.released && (
              have
                ? <button onClick={() => onPlay(s.surah)}>Play</button>
                : pct !== undefined
                  ? <span className="pct">{Math.round(pct * 100)}%</span>
                  : <button onClick={() => onDownload(s.surah)}>{formatBytes(s.bytes)}</button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/ui tests/format.test.ts src/App.tsx
git commit -m "feat: surah list with download state and release badges"
```

---

### Task 13: Verify screen for the 17 unverified surahs

Resolves the catalog-labelling risk. Plays the opening seconds of each flagged surah so the user confirms or rejects it, and records the verdict.

**Files:**
- Create: `src/ui/VerifyScreen.tsx`, `src/catalog/verification.ts`
- Test: `tests/verification.test.ts`

**Interfaces:**
- Consumes: `getPref`, `setPref`
- Produces:
  - `getVerdicts(): Promise<Record<number, 'ok' | 'wrong'>>`
  - `setVerdict(surah: number, v: 'ok' | 'wrong'): Promise<void>`
  - `effectiveVerified(s: SurahView, verdicts): boolean`

- [ ] **Step 1: Write the failing test**

`tests/verification.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { setVerdict, getVerdicts, effectiveVerified } from '../src/catalog/verification'

const view = (surah: number, verified: boolean) =>
  ({ surah, name: 'x', nameEn: 'x', ayahs: 1, released: true, verified, url: 'u', bytes: 1 }) as any

describe('verification', () => {
  it('trusts the catalog flag when there is no verdict', () => {
    expect(effectiveVerified(view(1, true), {})).toBe(true)
    expect(effectiveVerified(view(3, false), {})).toBe(false)
  })

  it('a user verdict overrides the catalog flag', () => {
    expect(effectiveVerified(view(3, false), { 3: 'ok' })).toBe(true)
    expect(effectiveVerified(view(1, true), { 1: 'wrong' })).toBe(false)
  })

  it('persists verdicts', async () => {
    await setVerdict(27, 'ok')
    expect((await getVerdicts())[27]).toBe('ok')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/verification.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/catalog/verification.ts`:

```ts
import { getPref, setPref } from '../db/prefs'
import type { SurahView } from './types'

export type Verdict = 'ok' | 'wrong'
const KEY = 'verdicts'

export async function getVerdicts(): Promise<Record<number, Verdict>> {
  return getPref<Record<number, Verdict>>(KEY, {})
}

export async function setVerdict(surah: number, v: Verdict) {
  const all = await getVerdicts()
  all[surah] = v
  await setPref(KEY, all)
}

export function effectiveVerified(s: SurahView, verdicts: Record<number, Verdict>): boolean {
  const v = verdicts[s.surah]
  if (v) return v === 'ok'
  return s.verified
}
```

- [ ] **Step 4: Run until green**

Run: `npx vitest run tests/verification.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Build the screen**

`src/ui/VerifyScreen.tsx` — lists surahs where `effectiveVerified` is false, each with a Play button that streams the first ~15 seconds directly from the catalog URL (no download needed), plus "Correct" and "Wrong" buttons calling `setVerdict`. A surah marked `wrong` is excluded from download and playback and shown in the storage screen as needing a replacement file via import.

- [ ] **Step 6: Commit**

```bash
git add src/catalog/verification.ts src/ui/VerifyScreen.tsx tests/verification.test.ts
git commit -m "feat: ear-check verification flow for unverified surahs"
```

---

### Task 14: PWA shell, offline install, and manual device verification

**Files:**
- Modify: `vite.config.ts`
- Create: `public/manifest.webmanifest`, `public/icon-512.png`
- Create: `docs/DEVICE-CHECKLIST.md`

- [ ] **Step 1: Add the PWA plugin**

In `vite.config.ts`:

```ts
import { VitePWA } from 'vite-plugin-pwa'

plugins: [
  react(),
  VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'Mushaf — ياسر الدوسري',
      short_name: 'Mushaf',
      start_url: '/',
      display: 'standalone',
      background_color: '#0b1120',
      theme_color: '#0b1120',
      icons: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
    },
    workbox: {
      // App shell only. Audio lives in IndexedDB and must never enter the SW cache.
      globPatterns: ['**/*.{js,css,html,json,png}'],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    },
  }),
]
```

- [ ] **Step 2: Build and confirm the service worker is emitted**

Run: `npm run build`
Expected: `dist/sw.js` and `dist/manifest.webmanifest` exist.

- [ ] **Step 3: Write the device checklist**

`docs/DEVICE-CHECKLIST.md` — the checks automation cannot cover:

```markdown
- [ ] Install to home screen (Android + iOS)
- [ ] Download surah 1, enable airplane mode, confirm it plays
- [ ] Lock the phone during playback — audio continues, controls appear
- [ ] Switch apps — audio continues
- [ ] Interrupt Al-Baqarah (218 MB) mid-download, reopen, confirm it resumes
- [ ] Reboot an iPhone, reopen, confirm downloaded audio survived
- [ ] Fill storage and confirm QuotaExceededError is explained, not a crash
- [ ] Delete a surah and confirm space is reclaimed in the storage screen
```

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts public docs/DEVICE-CHECKLIST.md
git commit -m "feat: PWA shell with app-shell-only precaching"
```

---

### Task 15: Catalog regeneration script

Lets new surahs be added without touching app code — the whole point of the growing-catalog design.

**Files:**
- Create: `scripts/build-catalog.mjs`
- Test: `tests/buildCatalog.test.ts`

**Interfaces:**
- Produces: rewrites `data/catalog.json`; exits non-zero on validation failure.

- [ ] **Step 1: Write the failing test**

`tests/buildCatalog.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateCatalog } from '../scripts/build-catalog.mjs'

describe('validateCatalog', () => {
  it('rejects duplicate surah numbers', () => {
    expect(() => validateCatalog([{ surah: 1, url: 'https://archive.org/a' }, { surah: 1, url: 'https://archive.org/b' }]))
      .toThrow(/duplicate/i)
  })
  it('rejects non-archive.org URLs', () => {
    expect(() => validateCatalog([{ surah: 1, url: 'https://media.altilawat.com/a.mp3' }])).toThrow(/archive\.org/i)
  })
  it('rejects out-of-range surah numbers', () => {
    expect(() => validateCatalog([{ surah: 0, url: 'https://archive.org/a' }])).toThrow(/range/i)
    expect(() => validateCatalog([{ surah: 115, url: 'https://archive.org/a' }])).toThrow(/range/i)
  })
  it('accepts a valid catalog', () => {
    expect(() => validateCatalog([{ surah: 1, url: 'https://archive.org/download/x/1.mp3' }])).not.toThrow()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/buildCatalog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the validator and generator**

`scripts/build-catalog.mjs`:

```js
export function validateCatalog(entries) {
  const seen = new Set()
  for (const e of entries) {
    if (!Number.isInteger(e.surah) || e.surah < 1 || e.surah > 114)
      throw new Error(`surah out of range: ${e.surah}`)
    if (seen.has(e.surah)) throw new Error(`duplicate surah: ${e.surah}`)
    seen.add(e.surah)
    if (!/(^|\.)archive\.org\//.test(e.url))
      throw new Error(`URL is not on archive.org (CORS-blocked): ${e.url}`)
  }
  return true
}
```

Add the scrape-and-merge routine below it, reusing the approach recorded in the spec: read the mushaf index, prefer archive.org mirrors, compare byte sizes against the correctly-labelled file, and set `verified: true` only when sizes agree within 2%.

- [ ] **Step 4: Run until green**

Run: `npx vitest run tests/buildCatalog.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts tests/buildCatalog.test.ts
git commit -m "feat: catalog regeneration script with CORS and duplicate validation"
```

---

## Self-Review

**Spec coverage:** Every spec section maps to a task — catalog growth (4, 15), source abstraction (11), storage (3, 7), chunked downloads (5, 6), playback and resume (8), continuous play and repeat (9), lock screen (10), surah list with release states (12), verification of the 17 flagged surahs (13), PWA offline shell and device checklist (14). Text view is deferred; see below.

**Deferred from v1:** The Arabic text screen (`data/quran-text.json` is generated and committed, so it is a single component away). It was the least essential feature in the design and adds no risk by waiting until audio playback is solid.

**Type consistency:** `SurahView` is defined once in `src/catalog/types.ts` and used unchanged in Tasks 4, 10, 12, and 13. `AudioSource.fetchSurah(surah, onProgress, signal)` has the same signature in Tasks 11 and 6. `getPref`/`setPref` are introduced in Task 8 and consumed in Task 13.

**Known risk carried forward:** 17 of 37 catalog entries are unverified. Task 13 exists specifically to close this, and Task 11's `CatalogSource` refuses non-archive.org URLs so the CORS trap cannot silently return.
