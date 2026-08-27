import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

/**
 * The Mushaf and Hifz tabs are unreachable on purpose.
 *
 * They are finished enough to use and not finished enough to ship, so rather
 * than delete them and lose the thread they sit behind one flag with every
 * component, asset and test still in place. That arrangement is easy to
 * misread: the next person to open App.tsx sees two tabs that never render
 * and a folder of components nothing appears to call, and tidies them away.
 *
 * These tests exist to say no. They are not checking behaviour — there is no
 * behaviour to check while the flag is off — they are checking that the work
 * is still here and still wired, so turning the flag back on is the whole of
 * the job.
 */

const app = readFileSync('src/App.tsx', 'utf8')

describe('the reading tabs, held back', () => {
  it('is held by exactly one flag', () => {
    // If this ever becomes two, the comment above stops being true and
    // whoever comes back to this has to find both.
    expect(app).toMatch(/const READING_TABS: boolean = false/)
    const uses = app.match(/READING_TABS/g) ?? []
    // The declaration, the two dock entries, the two routes, and the two
    // navigation helpers that would otherwise strand a reader on a tab that
    // no longer renders.
    expect(uses.length).toBeGreaterThanOrEqual(6)
  })

  it('is typed, so the compiler keeps checking the code it hides', () => {
    /*
     * `const READING_TABS = false` narrows to the literal type `false`, and
     * TypeScript then treats every guarded branch as unreachable and stops
     * checking it — which would let the held-back code rot silently, exactly
     * the outcome holding it back rather than deleting it was meant to avoid.
     */
    expect(app).toContain('const READING_TABS: boolean = false')
    expect(app).not.toMatch(/const READING_TABS = false/)
  })

  it('leaves nothing reachable that the flag does not gate', () => {
    // Both routes and both dock entries are behind it.
    expect(app).toContain("READING_TABS && tab === 'text'")
    expect(app).toContain("READING_TABS && tab === 'hifz'")
    expect(app).not.toMatch(/\n\s*\{tab === '(text|hifz)' && \(/)
  })

  it('still has every part of the work it is holding', () => {
    /*
     * The point of the flag. Delete any of these and the flag stops being a
     * switch and starts being a lie.
     */
    for (const f of [
      'src/ui/MushafView.tsx',
      'src/ui/MushafPage.tsx',
      'src/ui/MushafIndex.tsx',
      'src/ui/MushafPicker.tsx',
      'src/ui/HifzBoard.tsx',
      'src/mushaf/editions.ts',
      'src/mushaf/divisions.ts',
      'src/mushaf/tajweed.ts',
      'data/mushaf-layout.json',
      'data/divisions.json',
      'public/tajweed.json',
    ]) {
      expect(existsSync(f), `${f} is held back, not gone`).toBe(true)
    }
  })

  it('keeps the translation tab, which is not held back', () => {
    // It reads the same layout but has no page, no pager and no font of its
    // own, so it ships while the mushaf waits.
    expect(app).toContain("id: 'translation'")
    expect(app).not.toContain("READING_TABS && tab === 'translation'")
    expect(existsSync('src/ui/TranslationView.tsx')).toBe(true)
  })
})
