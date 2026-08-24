# Haram 1447 Taraweeh Compilation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Taraweeh and Tahajjud recitation from the Grand Mosque for 1447 AH to the catalog as its first multi-voice entry, attributing each surah to the imam who actually recited it.

**Architecture:** A fifth catalog entry, `haram-1447`, served through a new `/h/` route on the existing `mushaf-audio` Cloudflare Worker. Two optional fields (`voice`, `voiceEn`) on `CatalogEntry` carry per-surah attribution, which surfaces in the surah list, the player and the OS lock screen. The refresh script's seconds-per-letter plausibility check is stratified by voice instead of taking one median across the whole entry.

**Tech Stack:** React 18, TypeScript (strict), Vite 6, Vitest 2 + fake-indexeddb, Cloudflare Workers (`wrangler`), plain `.mjs` Node scripts for catalog tooling.

**Spec:** `docs/superpowers/specs/2026-08-24-haram-1447-taraweeh-design.md`

## Global Constraints

- **Never widen the plausibility gates.** They stay at `LOW = 0.69` and `HIGH = 1.45` verbatim. The check is stratified by voice; the band does not move.
- **`MIN_LETTERS = 150`.** Surahs below this are measured but never judged — Al-Fatiha runs 1.35× its text length legitimately.
- **`MIN_GROUP = 8`.** A voice with fewer measured surahs than this is left unjudged, never mis-judged.
- **Attribution is never invented.** An imam id that does not resolve fails the refresh; it must not write a blank `voice`.
- **Ids never reach the client.** `data/imams.json` and `data/voices-haram-1447.json` are build-time inputs. The catalog carries resolved display names.
- **Existing four reciters must be provably unchanged.** Every task that touches shared code carries a test proving it.
- **`scripts/` is outside `tsconfig.json`'s `include`** (`["src", "tests", "data"]`) and `allowJs` is false. Anything under `scripts/` stays plain `.mjs` and is tested from a `.test.mjs` file, which `tsc -b` ignores and Vitest still collects.
- **Arabic entry title:** `المصحف الصوتي والمرئي من صلاتي التراويح والتهجد بالمسجد الحرام ١٤٤٧`
- **Test command:** `npm test`. **Build command:** `npm run build` (runs `tsc -b` then `vite build`).

---

## Stage A — independent of the audio host

Tasks 1-6 need no external input and can land immediately.

## Stage B — needs the MP3 host and the attribution map

Tasks 7-9 are blocked until you have a host serving per-surah MP3s with `Range` support and a validator, plus the 114-row imam map.

---

## File Structure

**Create:**
- `scripts/lib/judge.mjs` — the pure per-voice plausibility check. No I/O.
- `tests/judge.test.mjs` — its tests.
- `src/catalog/voice.ts` — lang-aware attribution label and the MediaSession artist helpers. No I/O.
- `tests/voice.test.ts` — its tests.
- `data/imams.json` — `imamId → { name, nameEn }`.
- `data/voices-haram-1447.json` — `surah → imamId`.
- `public/haram.webp` — square medallion image, supplied by the user.

**Modify:**
- `src/catalog/types.ts` — add `voice`/`voiceEn` to `CatalogEntry` and `SurahView`; remove dead `name` from `CatalogEntry`.
- `src/catalog/load.ts:20` — carry the new fields through `buildView`, drop the `name` passthrough.
- `src/ui/SurahList.tsx:86` — attribution line.
- `src/ui/theme.css` — `.name-voice`, `.reciter-voice`, and `haram-1447` on the pre-cropped medallion rule at line 864.
- `src/App.tsx:341,693,1104,1303` — player block, MediaSession artist, native shell, Dock.
- `src/i18n/{en,ar,ur,hi,fr}.ts` — one new key.
- `scripts/refresh-catalog.mjs` — the `haram-1447` source, the `judgeByVoice` call, stop writing `name`.
- `worker/src/index.js` — the `/h/` route.
- `tests/data.test.ts` — catalog invariants.

---

### Task 1: The per-voice plausibility check

The one piece of genuinely new logic. Extracted from the script into a pure function because inline logic in an `.mjs` cannot be tested.

**Files:**
- Create: `scripts/lib/judge.mjs`
- Test: `tests/judge.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `judgeByVoice(measured, voiceOf, lettersIn)` where `measured` is an iterable of `[surah: number, { seconds: number | null }]`, `voiceOf` is `(surah: number) => string | null`, and `lettersIn` is `(surah: number) => number`. Returns `{ mismatched: Array<{ surah: number, factor: number, voice: string }>, judged: Set<number>, unjudged: number[] }`. Also exports the constants `MIN_LETTERS`, `MIN_GROUP`, `LOW`, `HIGH`.

- [ ] **Step 1: Write the failing test**

Create `tests/judge.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { judgeByVoice, MIN_GROUP } from '../scripts/lib/judge.mjs'

/** Every surah the same length, so a rate is purely the duration. */
const letters = () => 1000

/** [surah, seconds] pairs into the shape judgeByVoice consumes. */
const measure = (pairs) => pairs.map(([surah, seconds]) => [surah, { seconds }])

describe('judgeByVoice', () => {
  // The whole reason this function exists. Nine surahs at 50s and nine at
  // 120s share no meaningful median: sorted, the midpoint lands at 120, which
  // puts every one of the fast imam's surahs at 0.42x and deletes all nine.
  // Judged against his own pace, each imam sits at 1.0x.
  it('lets a fast imam and a slow imam coexist in one entry', () => {
    const voices = { A: [1, 2, 3, 4, 5, 6, 7, 8, 9], B: [10, 11, 12, 13, 14, 15, 16, 17, 18] }
    const voiceOf = (s) => (voices.A.includes(s) ? 'A' : 'B')
    const measured = measure([
      ...voices.A.map((s) => [s, 50]),
      ...voices.B.map((s) => [s, 120]),
    ])

    const { mismatched, judged, unjudged } = judgeByVoice(measured, voiceOf, letters)

    expect(mismatched).toEqual([])
    expect(judged.size).toBe(18)
    expect(unjudged).toEqual([])
  })

  // Stratifying must not blunt the check. A file holding the wrong recitation
  // still stands out against its own imam, which is what caught the four
  // Burhaji files that held each other's.
  it('still catches an outlier inside a single voice', () => {
    const surahs = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    const measured = measure(surahs.map((s) => [s, s === 9 ? 150 : 50]))

    const { mismatched, judged } = judgeByVoice(measured, () => 'A', letters)

    expect(mismatched).toHaveLength(1)
    expect(mismatched[0].surah).toBe(9)
    expect(mismatched[0].factor).toBeCloseTo(3, 5)
    expect(mismatched[0].voice).toBe('A')
    expect(judged.has(9)).toBe(true)
  })

  // A median of six samples is not a pace, it is a guess. Better to ship the
  // surahs unverified and let the VerifyPanel carry them than to delete a
  // legitimate recording on a median that means nothing.
  it('leaves a voice with fewer than MIN_GROUP surahs unjudged', () => {
    const surahs = [1, 2, 3, 4, 5, 6]
    expect(surahs.length).toBeLessThan(MIN_GROUP)
    const measured = measure(surahs.map((s) => [s, s === 6 ? 500 : 50]))

    const { mismatched, judged, unjudged } = judgeByVoice(measured, () => 'C', letters)

    expect(mismatched).toEqual([])
    expect(judged.size).toBe(0)
    expect(unjudged.sort((a, b) => a - b)).toEqual(surahs)
  })

  // Short surahs are dominated by the basmalah and by pauses, so their rate
  // carries no signal. Measured, never judged.
  it('never judges a surah below MIN_LETTERS', () => {
    const measured = measure([[1, 50], [2, 50], [3, 50], [4, 50], [5, 50], [6, 50], [7, 50], [8, 50], [9, 900]])
    // Surah 9 is the outlier, but its text is too short to judge.
    const lettersIn = (s) => (s === 9 ? 100 : 1000)

    const { mismatched, judged, unjudged } = judgeByVoice(measured, () => 'A', lettersIn)

    expect(mismatched).toEqual([])
    expect(judged.has(9)).toBe(false)
    expect(unjudged).not.toContain(9)
  })

  // A file this cannot parse — several sources serve .m4a — reports null
  // seconds. A garbage duration fed to the check silently drops good surahs.
  it('ignores surahs whose duration could not be read', () => {
    const measured = measure([[1, 50], [2, 50], [3, 50], [4, 50], [5, 50], [6, 50], [7, 50], [8, 50], [9, null]])

    const { judged, unjudged } = judgeByVoice(measured, () => 'A', letters)

    expect(judged.has(9)).toBe(false)
    expect(unjudged).not.toContain(9)
  })

  // The existing four reciters are one voice each, so they arrive here as a
  // single group and behave exactly as the whole-entry median did.
  it('treats a single-voice entry as one group', () => {
    const surahs = Array.from({ length: 40 }, (_, i) => i + 1)
    const measured = measure(surahs.map((s) => [s, s === 40 ? 100 : 50]))

    const { mismatched, judged } = judgeByVoice(measured, () => null, letters)

    expect(judged.size).toBe(40)
    expect(mismatched).toHaveLength(1)
    expect(mismatched[0].surah).toBe(40)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/judge.test.mjs`
Expected: FAIL — `Failed to resolve import "../scripts/lib/judge.mjs"`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/judge.mjs`:

```js
/**
 * Judge each measured surah against the pace of its own voice.
 *
 * Seconds per letter is roughly constant for one reciter, which is what makes
 * it a usable check: a file whose length is wildly out of step with its text
 * does not contain the surah it claims to. It is how the four Burhaji files
 * holding each other's recitations were found.
 *
 * One median across a whole entry assumes one voice. A Taraweeh compilation
 * rotates imams, so a deliberate reciter and a quick one land on opposite
 * sides of a shared median and the gates delete legitimate recordings.
 * Grouping by voice keeps the check and drops the assumption.
 *
 * The band is deliberately not widened to absorb the difference. Loosening it
 * enough to cover several imams would have let the Burhaji files through,
 * since they were off by roughly that margin.
 */

/** Below this, a surah is dominated by the basmalah and by pauses —
 *  Al-Fatiha runs 1.35x its text length quite legitimately. */
export const MIN_LETTERS = 150

/** A median of fewer samples than this is a guess, not a pace. */
export const MIN_GROUP = 8

export const LOW = 0.69
export const HIGH = 1.45

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

/**
 * @param measured  iterable of [surah, { seconds }]; null seconds means the
 *                  file could not be parsed and carries no signal.
 * @param voiceOf   surah -> voice, or null for an entry with a single voice.
 * @param lettersIn surah -> count of Quranic letters in its text.
 */
export function judgeByVoice(measured, voiceOf, lettersIn) {
  const groups = new Map()

  for (const [surah, m] of measured) {
    if (m?.seconds == null) continue
    const letters = lettersIn(surah)
    if (letters < MIN_LETTERS) continue
    const rate = m.seconds / letters
    if (!Number.isFinite(rate) || rate <= 0) continue
    // A single-voice entry groups under one key rather than taking a
    // separate path, so there is only one behaviour to reason about.
    const voice = voiceOf(surah) ?? ''
    if (!groups.has(voice)) groups.set(voice, [])
    groups.get(voice).push({ surah, rate })
  }

  const mismatched = []
  const judged = new Set()
  const unjudged = []

  for (const [voice, members] of groups) {
    if (members.length < MIN_GROUP) {
      for (const m of members) unjudged.push(m.surah)
      continue
    }
    const med = median(members.map((m) => m.rate))
    for (const m of members) {
      judged.add(m.surah)
      const factor = m.rate / med
      if (factor > HIGH || factor < LOW) mismatched.push({ surah: m.surah, factor, voice })
    }
  }

  return { mismatched, judged, unjudged }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/judge.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Confirm tsc ignores the new files**

Run: `npm run build`
Expected: succeeds. `scripts/` is outside `include` and `.test.mjs` is invisible to `tsc` with `allowJs: false` — if this errors, do **not** add `allowJs`; move the assertion into the test file instead.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/judge.mjs tests/judge.test.mjs
git commit -m "Judge a surah against the pace of its own voice"
```

---

### Task 2: Carry per-surah attribution through the catalog types

**Files:**
- Modify: `src/catalog/types.ts`
- Modify: `src/catalog/load.ts:20`
- Modify: `scripts/refresh-catalog.mjs` (the `.map` at line 349)
- Test: `tests/data.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CatalogEntry.voice?: string`, `CatalogEntry.voiceEn?: string`, `SurahView.voice: string | null`, `SurahView.voiceEn: string | null`. `CatalogEntry.name` no longer exists.

- [ ] **Step 1: Write the failing test**

Add to `tests/data.test.ts`, inside the `describe('bundled data')` block:

```ts
  // A compilation entry names the imam per surah. Attribution that is present
  // in one script and missing in the other renders as a blank line for half
  // the languages, so both are required together.
  it('gives every attributed surah both scripts', () => {
    for (const r of reciters) {
      for (const s of r.surahs) {
        const e = s as { voice?: string; voiceEn?: string }
        expect(Boolean(e.voice)).toBe(Boolean(e.voiceEn))
        if (e.voice) {
          expect(e.voice.trim().length).toBeGreaterThan(0)
          expect(e.voiceEn!.trim().length).toBeGreaterThan(0)
        }
      }
    }
  })

  // `name` held the surah's Arabic name, which buildView overwrites from
  // surahs.json anyway. It was dead, and a dead `name` beside a live `voice`
  // invites being repurposed by mistake.
  it('no longer carries a dead per-entry name', () => {
    for (const r of reciters) {
      for (const s of r.surahs) {
        expect(Object.prototype.hasOwnProperty.call(s, 'name')).toBe(false)
      }
    }
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/data.test.ts`
Expected: FAIL on `no longer carries a dead per-entry name` — every entry still has `name`. The both-scripts test passes vacuously, which is correct; it is a guard for Task 8.

- [ ] **Step 3: Update the types**

In `src/catalog/types.ts`, replace the `CatalogEntry` type:

```ts
export type CatalogEntry = {
  surah: number
  url: string
  fallbackUrl?: string | null
  bytes: number
  verified: boolean
  /**
   * Who recites this surah, when the entry is a compilation rather than one
   * sheikh's mushaf — Taraweeh at the Haram rotates imams across the month.
   * Absent means the entry has a single voice, already named on the reciter.
   */
  voice?: string
  voiceEn?: string
}
```

and add to `SurahView`, after `bytes`:

```ts
  /** Who recites this surah, or null for a single-voice mushaf. */
  voice: string | null
  voiceEn: string | null
```

- [ ] **Step 4: Carry them through buildView**

In `src/catalog/load.ts`, delete the `name: md.name,` line at line 20 — it is not part of `SurahView`'s catalog half and `md.name` is already assigned two lines above. Then add, after `bytes: e?.bytes ?? 0,`:

```ts
      voice: e?.voice ?? null,
      voiceEn: e?.voiceEn ?? null,
```

Note: `SurahView.name` still comes from `md.name` in the same object literal. Only the `CatalogEntry` passthrough goes.

- [ ] **Step 5: Stop writing the dead field**

In `scripts/refresh-catalog.mjs`, inside the `.map((surah) => { return { … } })` around line 349, delete this line:

```js
        name: meta[surah - 1].name,
```

- [ ] **Step 6: Strip it from the committed catalog**

Run:

```bash
node -e "const fs=require('fs');const p='data/catalog.json';const c=JSON.parse(fs.readFileSync(p,'utf8'));for(const r of c.reciters)for(const s of r.surahs)delete s.name;fs.writeFileSync(p,JSON.stringify(c,null,1)+'\n')"
```

Expected: `git diff --stat data/catalog.json` shows only removals.

- [ ] **Step 7: Run the full suite**

Run: `npm test && npm run build`
Expected: all tests PASS, build succeeds. `meta` may now be unused in `refresh-catalog.mjs`; leave the import, it is still used by `publishedCount`'s callers — if Node reports it genuinely unused, remove the binding.

- [ ] **Step 8: Commit**

```bash
git add src/catalog/types.ts src/catalog/load.ts scripts/refresh-catalog.mjs data/catalog.json tests/data.test.ts
git commit -m "Carry per-surah attribution, and drop the dead entry name"
```

---

### Task 3: The attribution label

**Files:**
- Create: `src/catalog/voice.ts`
- Create: `tests/voice.test.ts`
- Modify: `src/i18n/en.ts`, `src/i18n/ar.ts`, `src/i18n/ur.ts`, `src/i18n/hi.ts`, `src/i18n/fr.ts`

**Interfaces:**
- Consumes: `SurahView.voice`/`voiceEn` from Task 2.
- Produces: `voiceLabel(s: SurahView, lang: Lang): string | null`, `artistFor(s: SurahView, reciter: Reciter): string`, `artistForEn(s: SurahView, reciter: Reciter): string`, and the i18n key `recitedBy: string`.

- [ ] **Step 1: Write the failing test**

Create `tests/voice.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { voiceLabel, artistFor, artistForEn } from '../src/catalog/voice'
import type { SurahView, Reciter } from '../src/catalog/types'

const view = (over: Partial<SurahView> = {}): SurahView => ({
  surah: 1,
  name: 'ٱلْفَاتِحَةِ',
  nameEn: 'Al-Fatihah',
  translation: 'The Opening',
  ayahs: 7,
  released: true,
  verified: true,
  url: 'https://example.test/1.mp3',
  fallbackUrl: null,
  bytes: 1,
  voice: null,
  voiceEn: null,
  ...over,
})

const reciter = (over: Partial<Reciter> = {}): Reciter => ({
  id: 'dosari',
  name: 'ياسر الدوسري',
  nameEn: 'Yasser Al-Dosari',
  fullName: 'أ. د. ياسر بن راشد الدوسري',
  mushaf: 'إنتاج المركز السعودي للتلاوات القرآنية',
  released: 114,
  total: 114,
  surahs: [],
  ...over,
})

describe('voiceLabel', () => {
  // Arabic and Urdu readers are already reading the script the name is in.
  it('gives the Arabic form to the Arabic-script languages', () => {
    const s = view({ voice: 'عبد الرحمن السديس', voiceEn: 'Abdurrahman As-Sudais' })
    expect(voiceLabel(s, 'ar')).toBe('عبد الرحمن السديس')
    expect(voiceLabel(s, 'ur')).toBe('عبد الرحمن السديس')
  })

  it('gives the transliteration to the Latin-script languages', () => {
    const s = view({ voice: 'عبد الرحمن السديس', voiceEn: 'Abdurrahman As-Sudais' })
    expect(voiceLabel(s, 'en')).toBe('Abdurrahman As-Sudais')
    expect(voiceLabel(s, 'fr')).toBe('Abdurrahman As-Sudais')
    expect(voiceLabel(s, 'hi')).toBe('Abdurrahman As-Sudais')
  })

  // One sheikh's mushaf names him above the list. Repeating it on all 114
  // rows says nothing.
  it('is null for a single-voice mushaf', () => {
    expect(voiceLabel(view(), 'en')).toBeNull()
    expect(voiceLabel(view(), 'ar')).toBeNull()
  })

  // Attribution should degrade to the Arabic rather than vanish.
  it('falls back to the Arabic when no transliteration was supplied', () => {
    expect(voiceLabel(view({ voice: 'بندر بليلة' }), 'en')).toBe('بندر بليلة')
  })
})

describe('artistFor', () => {
  // The lock screen and the car. A compilation title there tells the listener
  // nothing about who they are hearing.
  it('names the imam when the surah has one', () => {
    const s = view({ voice: 'بندر بليلة', voiceEn: 'Bandar Baleela' })
    expect(artistFor(s, reciter())).toBe('بندر بليلة')
    expect(artistForEn(s, reciter())).toBe('Bandar Baleela')
  })

  // Proves the existing four entries are untouched.
  it('falls back to the reciter for a single-voice mushaf', () => {
    expect(artistFor(view(), reciter())).toBe('أ. د. ياسر بن راشد الدوسري')
    expect(artistForEn(view(), reciter())).toBe('Yasser Al-Dosari')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/voice.test.ts`
Expected: FAIL — cannot resolve `../src/catalog/voice`.

- [ ] **Step 3: Write the implementation**

Create `src/catalog/voice.ts`:

```ts
import type { Lang } from '../i18n'
import type { Reciter, SurahView } from './types'

/**
 * An imam's name is a proper noun, so it is not translated — only written in
 * whichever script the reader is already reading. Same reasoning as BRAND
 * in src/brand.ts and riwayahLabel in ./riwayah.ts.
 */
const ARABIC_SCRIPT: Lang[] = ['ar', 'ur']

/** Who recites this surah, or null when the entry has a single voice. */
export function voiceLabel(s: SurahView, lang: Lang): string | null {
  if (!s.voice) return null
  if (ARABIC_SCRIPT.includes(lang)) return s.voice
  return s.voiceEn ?? s.voice
}

/**
 * The artist for the lock screen, the car and the native shell.
 *
 * For a compilation this must be the imam, not the collection: "Taraweeh
 * 1447" on a lock screen says nothing about the voice coming out of the
 * speaker. Absent a voice it falls back to the reciter, which is what the
 * four single-voice mushafs have always shown.
 */
export const artistFor = (s: SurahView, r: Reciter): string => s.voice ?? r.fullName
export const artistForEn = (s: SurahView, r: Reciter): string => s.voiceEn ?? r.nameEn
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/voice.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add the i18n key**

In `src/i18n/en.ts`, immediately after the `reciter: 'Reciter',` line:

```ts
  /** Precedes an imam's name on a surah from a multi-voice compilation. */
  recitedBy: 'Recited by',
```

Then add the same key to the other four. `Strings` is derived from `en`, so `tsc` will demand each one:

- `src/i18n/ar.ts` → `recitedBy: 'قرأها',`
- `src/i18n/ur.ts` → `recitedBy: 'قاری',`
- `src/i18n/hi.ts` → `recitedBy: 'पाठकर्ता',`
- `src/i18n/fr.ts` → `recitedBy: 'Récité par',`

Place each beside that file's existing `reciter:` key so the files stay aligned.

- [ ] **Step 6: Verify the compiler is satisfied**

Run: `npm run build`
Expected: succeeds. A missing key fails here with `Property 'recitedBy' is missing` — add it to the named file rather than loosening the type.

- [ ] **Step 7: Commit**

```bash
git add src/catalog/voice.ts tests/voice.test.ts src/i18n/
git commit -m "Name the imam in the reader's own script"
```

---

### Task 4: Attribution in the surah list

**Files:**
- Modify: `src/ui/SurahList.tsx` (the `.names` span, around line 82-90)
- Modify: `src/ui/theme.css`

**Interfaces:**
- Consumes: `voiceLabel` from Task 3. `SurahList` already receives `lang` and `t` as props — no signature change.
- Produces: nothing.

- [ ] **Step 1: Add the import**

At the top of `src/ui/SurahList.tsx`, after the existing `import type { SurahView }` line:

```ts
import { voiceLabel } from '../catalog/voice'
```

- [ ] **Step 2: Render the attribution**

In `src/ui/SurahList.tsx`, replace the `.names` span:

```tsx
                <span className="names">
                  <span className="name-ar">
                    {t.surahWord} {s.name}
                  </span>
                  {lang === 'en' && (
                    <span className="name-plain">
                      {s.nameEn} · {s.translation}
                    </span>
                  )}
                </span>
```

with:

```tsx
                <span className="names">
                  <span className="name-ar">
                    {t.surahWord} {s.name}
                  </span>
                  {lang === 'en' && (
                    <span className="name-plain">
                      {s.nameEn} · {s.translation}
                    </span>
                  )}
                  {/* Not gated on language the way the gloss above is. A
                      gloss is a convenience for one language; who is
                      reciting is information every reader wants, and
                      voiceLabel already picks the right script. */}
                  {voiceLabel(s, lang) && (
                    <span className="name-voice">{voiceLabel(s, lang)}</span>
                  )}
                </span>
```

- [ ] **Step 3: Style it**

In `src/ui/theme.css`, find the existing `.name-plain` rule and add immediately after it:

```css
/* Who recited this surah, on a compilation. Quieter than the surah name and
   quieter than the gloss: it is the third thing you read in the row, not the
   first. */
.name-voice {
  font-size: 0.76rem;
  color: var(--muted);
  opacity: 0.85;
}
```

- [ ] **Step 4: Verify nothing regressed**

Run: `npm test && npm run build`
Expected: PASS and succeeds. No existing catalog entry has a `voice`, so every row must render exactly as before — `voiceLabel` returns null for all of them.

- [ ] **Step 5: Commit**

```bash
git add src/ui/SurahList.tsx src/ui/theme.css
git commit -m "Show who recited each surah in the list"
```

---

### Task 5: Attribution in the player

**Files:**
- Modify: `src/App.tsx` (the `.now` block, around lines 1102-1108)
- Modify: `src/ui/theme.css`

**Interfaces:**
- Consumes: `voiceLabel` from Task 3, `t.recitedBy` from Task 3. `currentView` and `lang` are already in scope at this point in `App.tsx`.
- Produces: nothing.

- [ ] **Step 1: Add the import**

In `src/App.tsx`, beside the existing `riwayahLabel` import:

```ts
import { voiceLabel } from './catalog/voice'
```

- [ ] **Step 2: Render it**

In `src/App.tsx`, replace:

```tsx
            <div className="now">
              <div className="surah-name">سُورَةُ {currentView.name}</div>
              <div className="label">{t.reciter}</div>
              <div className="reciter-ar">{reciter.fullName}</div>
              <div className="reciter-en">{reciter.nameEn}</div>
              {riwayahLabel(reciter, lang) && (
                <div className="reciter-riwayah">({riwayahLabel(reciter, lang)})</div>
              )}
            </div>
```

with:

```tsx
            <div className="now">
              <div className="surah-name">سُورَةُ {currentView.name}</div>
              <div className="label">{t.reciter}</div>
              <div className="reciter-ar">{reciter.fullName}</div>
              <div className="reciter-en">{reciter.nameEn}</div>
              {riwayahLabel(reciter, lang) && (
                <div className="reciter-riwayah">({riwayahLabel(reciter, lang)})</div>
              )}
              {/* The entry name above is the collection — "Taraweeh 1447" —
                  which does not say whose voice this is. Both belong here:
                  the collection identifies the recording, the imam
                  identifies the recitation. */}
              {voiceLabel(currentView, lang) && (
                <div className="reciter-voice">
                  {t.recitedBy} {voiceLabel(currentView, lang)}
                </div>
              )}
            </div>
```

- [ ] **Step 3: Style it**

In `src/ui/theme.css`, immediately after the existing `.reciter-riwayah` rule:

```css
/* The imam on a compilation. Weighted like the riwayah line beside it —
   supporting detail under the entry name, not competing with it. */
.reciter-voice {
  font-size: 0.82rem;
  color: var(--muted);
  margin-top: 0.15rem;
}
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: PASS and succeeds. With no `voice` in the catalog the player block is byte-identical to before.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/ui/theme.css
git commit -m "Name the imam in the player, beside the collection"
```

---

### Task 6: The lock screen, the native shell and the dock

The most visible way this change can fail: a wrong artist on a lock screen or in a car.

**Files:**
- Modify: `src/App.tsx:341` (`updateMetadata`), `:693` (`publishNowPlaying`), `:1303` (`Dock`)

**Interfaces:**
- Consumes: `artistFor`, `artistForEn` from Task 3. `updateMetadata(s, reciter: string, base)` already takes the artist as a string — no signature change to `src/player/mediaSession.ts`.
- Produces: nothing.

- [ ] **Step 1: Add the import**

Extend the Task 5 import in `src/App.tsx`:

```ts
import { artistFor, artistForEn, voiceLabel } from './catalog/voice'
```

- [ ] **Step 2: The lock screen**

In `src/App.tsx`, inside `playSurah`, replace:

```tsx
      updateMetadata(s, reciter.fullName, import.meta.env.BASE_URL)
```

with:

```tsx
      // The imam, not the collection: "Taraweeh 1447" on a lock screen or a
      // head unit says nothing about the voice being heard.
      updateMetadata(s, artistFor(s, reciter), import.meta.env.BASE_URL)
```

- [ ] **Step 3: The native shell**

In the `publishNowPlaying` effect, replace `reciter: reciter.fullName,` with:

```tsx
            reciter: artistFor(currentView, reciter),
```

- [ ] **Step 4: The dock**

In the `<Dock now={…}>` prop, replace `reciter: reciter.nameEn,` with:

```tsx
                reciter: artistForEn(currentView, reciter),
```

Leave `reciterId: reciter.id` as it is — the dock uses it to frame the photo, which is still the entry's image, not the imam's.

- [ ] **Step 5: Verify**

Run: `npm test && npm run build`
Expected: PASS and succeeds. `tests/voice.test.ts` already proves the fallback returns `reciter.fullName` and `reciter.nameEn` when no voice is set, so the existing four are unchanged at all three call sites.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "Put the imam on the lock screen, not the collection"
```

---

## Stage B — blocked on the audio host and the attribution map

Do not start Task 7 until you have both:

1. **A host** serving per-surah MP3s that answers `206` to a `Range` request and sends an `ETag` or `Last-Modified`. Verify with:
   ```bash
   curl -sI -H 'Range: bytes=0-1' '<candidate-url>' | grep -iE 'content-range|accept-ranges|etag|last-modified'
   ```
   A `206` with a `Content-Range` and one validator is the bar. **No validator means download must be disabled for this entry** — `fetchRange` omits `If-Range` without one, so a resume can splice two recordings together silently (`src/download/chunked.ts:56,118`).
2. **The 114-row imam map**, from the channel's video titles or the host's labelling.

---

### Task 7: The `/h/` route on the Worker

**Files:**
- Modify: `worker/src/index.js` — header comment, `ROUTES`, the health payload, the path regex

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `GET /h/{1-114}.mp3` on `https://mushaf-audio.mushaftarteel.workers.dev`, CORS-attached, `Range` and `If-Range` forwarded.

- [ ] **Step 1: Write the resolver**

Pick the variant matching the host you verified. Both are complete; use one.

**Variant A — the host serves a predictable path** (the simpler case). Add after the `HARAMAIN` block:

```js
/* ---------------- Haram 1447 Taraweeh ----------------
 * Taraweeh and Tahajjud at the Grand Mosque for 1447, published by
 * شؤون الأئمة والمؤذنين. Unlike the mushafs above this is a compilation:
 * the imams rotate across the month, so the attribution lives per surah in
 * the catalog rather than on the reciter.
 *
 * Ramadan 1447 is over, so the list does not grow and there is no index to
 * poll — hence no /count/h route.
 */
const HARAM_1447 = {
  // Set to the verified base once the host is confirmed.
  base: 'https://REPLACE-WITH-VERIFIED-HOST/taraweeh1447',
  name: 'Haram 1447 — Taraweeh and Tahajjud',
}

/** Zero-padded to three digits, which is how these are conventionally named. */
const resolveHaram1447 = (surah) =>
  `${HARAM_1447.base}/${String(surah).padStart(3, '0')}.mp3`
```

**Variant B — the host is a collection page per surah.** Add a fourth entry to the existing `HARAMAIN` map instead, and no new resolver is needed:

```js
  h: {
    host: 'https://REPLACE-WITH-VERIFIED-HOST',
    collection: 0, // the verified collection id
    name: 'Haram 1447 — Taraweeh and Tahajjud',
  },
```

- [ ] **Step 2: Register the route**

Add to `ROUTES`. For Variant A:

```js
  h: {
    ttl: HARAMAIN_PAGE_TTL,
    resolve: (surah) => resolveHaram1447(surah),
    name: HARAM_1447.name,
  },
```

For Variant B:

```js
  h: {
    ttl: HARAMAIN_PAGE_TTL,
    resolve: (surah, ctx) => resolveHaramain(HARAMAIN.h, surah, ctx),
    name: HARAMAIN.h.name,
  },
```

- [ ] **Step 3: Widen the path regex**

Replace:

```js
    const match = /^\/([bdtj])\/(\d{1,3})\.mp3$/.exec(url.pathname)
    if (!match) {
      return new Response('Not found. Use /b, /d, /t or /j + /{1-114}.mp3', {
```

with:

```js
    const match = /^\/([bdtjh])\/(\d{1,3})\.mp3$/.exec(url.pathname)
    if (!match) {
      return new Response('Not found. Use /b, /d, /t, /j or /h + /{1-114}.mp3', {
```

Leave the `/count/([dtj])` regex alone. This entry is complete and uses `fixedCount`, so nothing asks it for a count.

- [ ] **Step 4: List it on the health route**

In the `/health` payload, add to `routes`:

```js
            '/h/{1-114}.mp3': ROUTES.h.name,
```

- [ ] **Step 5: Verify against the deployed Worker**

```bash
cd worker && npx wrangler deploy
curl -sI -H 'Range: bytes=0-1' -H 'Origin: http://localhost:5177' \
  'https://mushaf-audio.mushaftarteel.workers.dev/h/1.mp3'
```

Expected: `206`, a `Content-Range` ending in the full byte length, `Access-Control-Allow-Origin: http://localhost:5177`, and `Access-Control-Expose-Headers` including `ETag`. If `Accept-Ranges` is absent and the status is `200`, the origin is not honouring ranges — stop and revisit the host, because the downloader cannot work against it.

- [ ] **Step 6: Commit**

```bash
git add worker/src/index.js
git commit -m "Proxy the Haram 1447 Taraweeh recordings"
```

---

### Task 8: The attribution data and the catalog entry

**Files:**
- Create: `data/imams.json`, `data/voices-haram-1447.json`
- Modify: `scripts/refresh-catalog.mjs`
- Test: `tests/data.test.ts`

**Interfaces:**
- Consumes: `judgeByVoice` (Task 1), the `voice`/`voiceEn` fields (Task 2), the `/h/` route (Task 7).
- Produces: a `haram-1447` entry in `data/catalog.json` with `voice`/`voiceEn` on every surah.

- [ ] **Step 1: Write the imam roster**

Create `data/imams.json`. One line per imam who led Taraweeh or Tahajjud that year — **fill from the actual source, do not guess**:

```json
{
  "sudais": { "name": "عبد الرحمن السديس", "nameEn": "Abdurrahman As-Sudais" },
  "baleela": { "name": "بندر بليلة", "nameEn": "Bandar Baleela" }
}
```

- [ ] **Step 2: Write the surah map**

Create `data/voices-haram-1447.json`, `surah → imamId`, all 114 keys:

```json
{
  "1": "sudais",
  "2": "baleela"
}
```

- [ ] **Step 3: Write the failing test**

Add to `tests/data.test.ts`:

```ts
import imams from '../data/imams.json'
import voices1447 from '../data/voices-haram-1447.json'
```

and inside `describe('bundled data')`:

```ts
  describe('Haram 1447 — a compilation, not one sheikh', () => {
    const h = reciters.find((r) => r.id === 'haram-1447')!

    it('is present and complete', () => {
      expect(h).toBeDefined()
      expect(h.surahs).toHaveLength(114)
      expect(h.released).toBe(h.surahs.length)
    })

    it('routes every surah through the CORS proxy', () => {
      for (const s of h.surahs) {
        expect(s.url).toMatch(/workers\.dev\/h\/\d+\.mp3$/)
      }
    })

    // Attribution is the point of this entry. A blank one is worse than no
    // entry at all: it asserts the recitation is unattributed when it is not.
    it('attributes every surah in both scripts', () => {
      for (const s of h.surahs) {
        const e = s as unknown as { voice?: string; voiceEn?: string }
        expect(e.voice, `surah ${s.surah}`).toBeTruthy()
        expect(e.voiceEn, `surah ${s.surah}`).toBeTruthy()
      }
    })

    it('names more than one imam', () => {
      const names = new Set(h.surahs.map((s) => (s as unknown as { voice: string }).voice))
      expect(names.size).toBeGreaterThan(1)
    })

    // Hafs, so the mushaf page pairing applies and must not be disabled.
    it('carries no riwayah, so the Hafs pages stand', () => {
      expect(Object.prototype.hasOwnProperty.call(h, 'riwayah')).toBe(false)
    })
  })

  describe('the attribution sources', () => {
    const map = voices1447 as Record<string, string>

    it('covers all 114 surahs', () => {
      const nums = Object.keys(map).map(Number).sort((a, b) => a - b)
      expect(nums).toEqual(Array.from({ length: 114 }, (_, i) => i + 1))
    })

    // An id with no entry in the roster would resolve to a blank attribution.
    // The refresh fails on it; this catches it before the refresh runs.
    it('uses only ids the roster defines', () => {
      const roster = imams as Record<string, { name: string; nameEn: string }>
      for (const [surah, id] of Object.entries(map)) {
        expect(roster[id], `surah ${surah} names unknown imam "${id}"`).toBeDefined()
      }
    })

    it('gives every imam both scripts', () => {
      for (const [id, who] of Object.entries(imams as Record<string, { name: string; nameEn: string }>)) {
        expect(who.name.trim().length, id).toBeGreaterThan(0)
        expect(who.nameEn.trim().length, id).toBeGreaterThan(0)
      }
    })
  })
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run tests/data.test.ts`
Expected: FAIL — no `haram-1447` in the catalog yet, and the map does not cover 114.

- [ ] **Step 5: Wire the source into the refresh script**

In `scripts/refresh-catalog.mjs`, add the imports at the top, beside the existing `readFileSync`:

```js
import { judgeByVoice } from './lib/judge.mjs'

const imams = JSON.parse(readFileSync('data/imams.json', 'utf8'))
const voices1447 = JSON.parse(readFileSync('data/voices-haram-1447.json', 'utf8'))
```

Add to `SOURCES`:

```js
  /**
   * The first entry that is not one sheikh's mushaf.
   *
   * Taraweeh at the Haram rotates imams across the month, so attribution
   * lives per surah rather than on the reciter, and the plausibility check
   * is judged per voice — see scripts/lib/judge.mjs.
   *
   * Ramadan 1447 is over, so the list is fixed and there is nothing to poll.
   */
  'haram-1447': {
    route: 'h',
    countPath: null,
    fixedCount: 114,
    name: 'الحرم المكي ١٤٤٧',
    nameEn: 'Haram 1447 — Taraweeh',
    fullName: 'تراويح وتهجد الحرم ١٤٤٧',
    mushaf: 'المصحف الصوتي والمرئي من صلاتي التراويح والتهجد بالمسجد الحرام ١٤٤٧',
    mushafEn: "Taraweeh and Tahajjud at the Grand Mosque, 1447",
    photo: 'haram.webp',
    /** surah -> imam id, resolved to display names below. */
    voices: voices1447,
    exclude: [],
  },
```

- [ ] **Step 6: Resolve ids to names, refusing a blank**

In `scripts/refresh-catalog.mjs`, add above `async function refresh(id)`:

```js
/**
 * An imam id resolved to display names.
 *
 * Fails loudly rather than writing a blank attribution. Wrong or missing
 * attribution on a recitation is the worst failure this app has — the same
 * reason matchFilename refuses to guess a surah from a filename.
 */
function voiceFor(src, surah) {
  const id = src.voices?.[String(surah)]
  if (!id) {
    if (!src.voices) return null
    throw new Error(`no imam recorded for surah ${surah}`)
  }
  const who = imams[id]
  if (!who) throw new Error(`surah ${surah} names unknown imam "${id}"`)
  return { voice: who.name, voiceEn: who.nameEn }
}
```

- [ ] **Step 7: Replace the single-median check**

In `scripts/refresh-catalog.mjs`, replace the whole block from the `// Seconds per letter should be roughly constant` comment through the closing brace of `if (rates.length >= 30) { … }` with:

```js
  // Seconds per letter is roughly constant for one reciter. A compilation
  // rotates imams, so it is judged per voice — see scripts/lib/judge.mjs for
  // why the band is stratified rather than widened.
  const measured = [...results.entries()].filter(([, m]) => m.seconds != null)
  const { mismatched, judged, unjudged } = judgeByVoice(
    results.entries(),
    (surah) => voiceFor(src, surah)?.voice ?? null,
    lettersIn,
  )
  if (unjudged.length) {
    console.warn(
      `  ${unjudged.length} surah(s) in voices with fewer than 8 recordings — shipped unverified`,
    )
  }
```

Delete the now-unused `rates` and `MIN_LETTERS` locals — `MIN_LETTERS` lives in `judge.mjs` now. Keep the `unreadable` log line below it as it is; it reads `results.size - measured.length`, which is why `measured` is retained.

- [ ] **Step 8: Attribute and mark each entry**

In the `.map((surah) => { return { … } })` that builds `entry.surahs`, add before `verified:`:

```js
        ...(voiceFor(src, surah) ?? {}),
```

and replace the `verified:` line with:

```js
        // Resolved from its own source page, so the name-to-audio link comes
        // from the source rather than a filename guess. A remapped surah is
        // identified by duration, so it asks for an ear check — and a surah
        // whose voice had too few recordings to judge was never checked at
        // all, so it asks too.
        verified:
          (!src.remap?.[surah] || !!src.earConfirmed?.includes(surah)) &&
          (!src.voices || judged.has(surah)),
```

- [ ] **Step 9: Run the refresh**

```bash
node scripts/refresh-catalog.mjs haram-1447
```

Expected: `haram-1447: 114 published`, then `All 114 resolved`, a per-voice warning only for imams with fewer than 8 surahs, and a final size line. If it reports `refusing to write a catalog with holes`, surahs are unreachable through the proxy — fix the Worker or the host, do not set `partialOk`.

- [ ] **Step 10: Run the suite**

Run: `npm test && npm run build`
Expected: all PASS, including the Task 2 both-scripts guard, which is no longer vacuous.

- [ ] **Step 11: Commit**

```bash
git add data/imams.json data/voices-haram-1447.json data/catalog.json scripts/refresh-catalog.mjs tests/data.test.ts
git commit -m "Add the Haram 1447 Taraweeh entry, judged per imam"
```

---

### Task 9: The medallion

**Files:**
- Create: `public/haram.webp` (supplied by the user, square)
- Modify: `src/ui/theme.css:864`

**Interfaces:**
- Consumes: the `haram-1447` entry from Task 8.
- Produces: nothing.

- [ ] **Step 1: Add the image**

Place a square `haram.webp` in `public/`. The medallion is `5.4rem` and rendered at up to 2× — 256×256 is enough. Confirm:

```bash
node -e "const s=require('fs').statSync('public/haram.webp');console.log(s.size,'bytes')"
```

- [ ] **Step 2: Frame it**

In `src/ui/theme.css`, add `haram-1447` to the pre-cropped rule around line 864:

```css
.medallion[data-reciter='burhaji-nabawi'],
.medallion[data-reciter='turki'],
.medallion[data-reciter='juhany'],
.medallion[data-reciter='haram-1447'] {
  --face-zoom: 100%;
  --face-x: 50%;
  --face-y: 50%;
}
```

The comment above that rule says the portraits are cropped square before they ship. This image is not a portrait but ships square for the same reason, so it needs the same values — worth a word in the comment:

```css
/*
 * The portraits are cropped square on the face before they ship, so the
 * frame needs no per-reciter nudging: one set of values is right for every
 * one of them, at every size, on every screen. The variables stay because
 * Al-Dosari's photo is still an uncropped original.
 *
 * haram-1447 is not a portrait at all — a compilation has no one face — but
 * it ships square for the same reason and takes the same values.
 */
```

- [ ] **Step 3: See it in the real app**

Run: `npm run dev`, open the reciter picker, select the Haram entry, play a surah. Confirm: the medallion is not zoomed or off-centre; the player shows the collection name **and** the imam beneath it; the surah list shows the imam on each row; the imam appears on the OS media controls rather than the collection.

- [ ] **Step 4: Run the suite**

Run: `npm test && npm run build`
Expected: PASS and succeeds.

- [ ] **Step 5: Commit**

```bash
git add public/haram.webp src/ui/theme.css
git commit -m "Frame the Haram medallion"
```

---

## Self-review notes

**Spec coverage.** Fetch path → Task 7. Catalog shape (`voice`/`voiceEn`, dead `name`, the two data files, id-to-name resolution) → Tasks 2 and 8. Verification (per-voice median, extracted pure function, `verified = judged && withinGates`) → Tasks 1 and 8. App surface (medallion, three attribution sites, i18n key) → Tasks 3, 4, 5, 6, 9. Testing → folded into the task that produces each behaviour. "Needs no work" needs no task by definition, and Task 8's `carries no riwayah` test pins the one claim in it that could silently regress.

**Two deliberate deviations from the spec, both narrowing:**
- The spec put the pure function at `scripts/lib/judge.mjs` without saying how it would be tested. `tsconfig.json` includes `tests` but not `scripts`, and `allowJs` is false, so a `.ts` test importing an untyped `.mjs` fails `tsc -b`. The test is therefore `tests/judge.test.mjs` — invisible to `tsc`, still collected by Vitest's default `**/*.{test,spec}.?(c|m)[jt]s?(x)`.
- The spec's `judge.test.ts` case list said "a group of six goes unjudged". Kept, plus two cases it implied but did not name: a null duration, and a single-voice entry behaving as before. The latter is what proves the existing four reciters are untouched.

**Threshold change worth flagging.** The old check required 30 measured surahs before judging anything; `MIN_GROUP` is 8. For the existing four this is inert — each is one voice with 83-114 surahs, far above either number. But a future single-voice reciter with 10 released surahs would now be judged where before it was not. That is the intended direction (a mislabel in a 10-surah mushaf is worth catching), and it is recorded here because the spec did not call it out.
