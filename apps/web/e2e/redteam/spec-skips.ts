// Detects a red-team spec that is still statically skipped, for attack-surface.test.ts.

/** Matches a line (after leading whitespace) opening a titled skip; group 2 is empty when the title starts on the next line. */
const STATIC_SKIP_LINE_RE =
  /^\s*(test\.describe\.skip|test\.describe\.fixme|test\.skip|test\.fixme|it\.skip|describe\.skip)\(\s*(['"`]|$)/

/** Matches a line whose first token opens a string literal. */
const TITLE_START_RE = /^\s*['"`]/

/** Index of the line holding a titled skip's title, or `null` when `lines[index]` opens no titled skip. */
function skipTitleIndex(lines: readonly string[], index: number): number | null {
  const match = STATIC_SKIP_LINE_RE.exec(lines[index] ?? '')
  if (!match) return null
  if (match[2] !== '') return index
  return TITLE_START_RE.test(lines[index + 1] ?? '') ? index + 1 : null
}

/** Matches an unconditional untitled `test.skip()` / `test.skip(true`, or a `test.skip(` whose argument starts on the next line — static unless inside a control-flow block. */
const UNTITLED_SKIP_LINE_RE = /^\s*test\.(skip|fixme)\(\s*(?:\)|true\b|$)/

/** Matches a line starting with an unconditional untitled skip's argument list: `)` or `true`. */
const UNTITLED_SKIP_ARG_RE = /^\s*(?:\)|true\b)/

/** Matches a statement head opening a control-flow block (`if`, `else`, a loop, a `switch` case or a `catch`). */
const CONTROL_FLOW_HEAD_RE = /^\s*(?:\}\s*)?(?:if|else|for|while|switch|case|default|catch)\b/

/** The index of the line holding the nearest unclosed `{` above `lines[index]`, or `null` at top level. */
function enclosingOpenerIndex(lines: readonly string[], index: number): number | null {
  let depth = 0
  for (let i = index - 1; i >= 0; i--) {
    for (const ch of [...(lines[i] ?? '')].reverse()) {
      if (ch === '}') depth++
      else if (ch === '{' && depth-- === 0) return i
    }
  }
  return null
}

/** The first line of the statement ending at `lines[index]`: walks up past wrapped arguments until parentheses balance. */
function statementHead(lines: readonly string[], index: number): string {
  let balance = 0
  for (let i = index; i >= 0; i--) {
    for (const ch of lines[i] ?? '') {
      if (ch === '(') balance++
      else if (ch === ')') balance--
    }
    if (balance >= 0) return lines[i] ?? ''
  }
  return lines[index] ?? ''
}

/** True when `lines[index]` is an unconditional untitled skip call, its argument on the same or the next line. */
function isUntitledSkipCall(lines: readonly string[], index: number): boolean {
  if (!UNTITLED_SKIP_LINE_RE.test(lines[index] ?? '')) return false
  return !/\(\s*$/.test(lines[index] ?? '') || UNTITLED_SKIP_ARG_RE.test(lines[index + 1] ?? '')
}

/** True when `lines[index]` skips its whole block: a titled skip, or an unconditional untitled one outside any control-flow block. */
function isStaticSkipLine(lines: readonly string[], index: number): boolean {
  if (skipTitleIndex(lines, index) !== null) return true
  if (!isUntitledSkipCall(lines, index)) return false
  const opener = enclosingOpenerIndex(lines, index)
  return opener === null || !CONTROL_FLOW_HEAD_RE.test(statementHead(lines, opener))
}

/** True when the spec source holds a static skip. */
function hasStaticSkip(source: string): boolean {
  const lines = source.split(/\r\n|\n/)
  return lines.some((_, i) => isStaticSkipLine(lines, i))
}

/** IDs of 7-cell rows past `GAP` whose spec is still skipped — a skipped spec passes `e2e:redteam` while running nothing. */
export function skippedSpecRowIds(
  rows: string[][],
  readSpec: (name: string) => string,
  specFileExists: (name: string) => boolean = () => true,
): string[] {
  return rows
    .filter((r) => r.length === 7 && r[4]?.trim() !== 'GAP')
    .filter((r) => specFileExists((r[3] ?? '').trim()))
    .filter((r) => hasStaticSkip(readSpec((r[3] ?? '').trim())))
    .map((r) => (r[0] ?? '').trim())
}
