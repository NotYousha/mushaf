import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

/**
 * No hook below an early return.
 *
 * React identifies hooks by call order, so one that sits behind a conditional
 * `return` runs on some renders and not others, and the whole app drops into
 * the error boundary the moment the condition flips. It is invisible in
 * review — the code reads perfectly — and it passes both the type check and
 * the build. It happened twice in one afternoon in MushafView, whose
 * `if (!layout) return` sits two thirds of the way down the component with
 * plenty of inviting places to add a memo underneath it.
 *
 * A lint rule is the usual answer; this repo has no lint config, and a test
 * that reads the file costs nothing and fails loudly.
 */

const HOOK =
  /^\s*(?:const|let)?\s*[\w[\], {}]*\s*=?\s*(useMemo|useState|useEffect|useCallback|useRef|useReducer|useLayoutEffect)\(/
// A return at the function's own indent, and not the final `return (` that
// opens the JSX.
const EARLY_RETURN = /^  (?:if \(.*\) )?return /
// A new top-level declaration ends the previous one's scope. Without this the
// `return 0` inside a module-level helper leaks into the component declared
// below it and condemns every hook in the file.
const TOP_LEVEL = /^(?:export\s+)?(?:default\s+)?(?:function|const|class)\s/

function offenders(src: string): string[] {
  // Split on either ending: the working copies here are CRLF, and a stray
  // carriage return defeats a pattern anchored at the end of a line.
  const lines = src.split(/\r?\n/)
  const bad: string[] = []
  let returnedAt = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (TOP_LEVEL.test(line)) returnedAt = -1
    if (EARLY_RETURN.test(line) && !/return \($/.test(line.trimEnd())) {
      if (returnedAt === -1) returnedAt = i
    }
    if (returnedAt !== -1 && HOOK.test(line)) {
      bad.push(`line ${i + 1}: ${line.trim().slice(0, 60)}`)
    }
  }
  return bad
}

describe('hook order', () => {
  const files = readdirSync('src/ui').filter((f) => f.endsWith('.tsx'))

  it.each(files)('%s calls no hook after an early return', (file) => {
    expect(offenders(readFileSync(`src/ui/${file}`, 'utf8'))).toEqual([])
  })

  it('App.tsx calls no hook after an early return', () => {
    expect(offenders(readFileSync('src/App.tsx', 'utf8'))).toEqual([])
  })

  it('catches the shape it exists to catch', () => {
    const broken = [
      'function C() {',
      '  const [a, setA] = useState(0)',
      '  if (!a) return <p />',
      '  const b = useMemo(() => 1, [])',
      '  return (',
      '    <div />',
      '  )',
      '}',
    ].join('\n')
    expect(offenders(broken)).toHaveLength(1)
  })

  it('does not blame a component for a helper declared above it', () => {
    const fine = [
      'function helper(n: number) {',
      '  if (!n) return 0',
      '  return n * 2',
      '}',
      '',
      'export function C() {',
      '  const [a] = useState(0)',
      '  return <p>{helper(a)}</p>',
      '}',
    ].join('\n')
    expect(offenders(fine)).toEqual([])
  })
})
