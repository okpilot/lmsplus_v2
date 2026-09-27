// Detects a red-team spec that is still statically skipped, for attack-surface.test.ts.

/** Matches a line (after leading whitespace) opening a titled skip; group 2 is empty when the title starts on the next line. */
const STATIC_SKIP_LINE_RE =
  /^\s*(test\.describe\.skip|test\.describe\.fixme|test\.skip|test\.fixme|it\.skip|describe\.skip)\(\s*(['"`]|$)/

/** Matches a line whose first token opens a string literal. */
const TITLE_START_RE = /^\s*['"`]/

/** Matches a comment line (after trimming). */
const COMMENT_LINE_RE = /^(\/\/|\/\*|\*)/

/** Index of the line holding a titled skip's title, or `null` when `lines[index]` opens no titled skip. */
function skipTitleIndex(lines: readonly string[], index: number): number | null {
  const match = STATIC_SKIP_LINE_RE.exec(lines[index])
  if (!match) return null
  if (match[2] !== '') return index
  return TITLE_START_RE.test(lines[index + 1] ?? '') ? index + 1 : null
}

/** Matches an unconditional untitled `test.skip()` / `test.skip(true`, or a `test.skip(` whose argument starts on the next line — static only directly in a describe, test or hook body. */
const UNTITLED_SKIP_LINE_RE = /^\s*test\.(skip|fixme)\(\s*(?:\)|true\b|$)/

/** Matches a line starting with an unconditional untitled skip's argument list: `)` or `true`. */
const UNTITLED_SKIP_ARG_RE = /^\s*(?:\)|true\b)/

/** Matches a line opening a describe block's, a test's or a beforeEach/beforeAll hook's body. */
const BLOCK_OPENER_RE =
  /\b(test\.)?describe(\.\w+)?\(|^\s*(test|it)(\.only)?\(\s*['"`]|\btest\.before(Each|All)\(/

/** The index of the line holding the nearest unclosed `{` above `lines[index]`, or `null` at top level. */
function enclosingOpenerIndex(lines: readonly string[], index: number): number | null {
  let depth = 0
  for (let i = index - 1; i >= 0; i--) {
    for (const ch of [...lines[i]].reverse()) {
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
    for (const ch of lines[i]) {
      if (ch === '(') balance++
      else if (ch === ')') balance--
    }
    if (balance >= 0) return lines[i]
  }
  return lines[index]
}

/** True when `lines[index]` is an unconditional untitled skip call, its argument on the same or the next line. */
function isUntitledSkipCall(lines: readonly string[], index: number): boolean {
  if (!UNTITLED_SKIP_LINE_RE.test(lines[index])) return false
  return !/\(\s*$/.test(lines[index]) || UNTITLED_SKIP_ARG_RE.test(lines[index + 1] ?? '')
}

/** True when `lines[index]` skips its whole block: a titled skip, or an untitled one directly in a describe, test or hook body. */
function isStaticSkipLine(lines: readonly string[], index: number): boolean {
  if (skipTitleIndex(lines, index) !== null) return true
  if (!isUntitledSkipCall(lines, index)) return false
  const opener = enclosingOpenerIndex(lines, index)
  return opener === null || BLOCK_OPENER_RE.test(statementHead(lines, opener))
}

/** Matches a `// Vector <ID>`-style attribution comment, capturing the exact ID token. */
const VECTOR_ATTRIBUTION_RE =
  /\bVectors?\s+([A-Za-z][\w-]*(?:\s*(?:,|\/|&|\band\b)\s*(?:Vectors?\s+)?[A-Za-z][\w-]*)*)/g

/** Separates the IDs of one `Vector A, B and C` list. */
const VECTOR_LIST_SEPARATOR_RE = /\s*(?:,|\/|&|\band\b)\s*(?:Vectors?\s+)?/

/** A matrix vector ID's shape: an uppercase run, optionally digits and a hyphenated suffix (`BO-ended_at`). */
const VECTOR_ID_TOKEN_RE = /^[A-Z]+\d*(?:-\w+)?$/

/** Every vector ID a line attributes a skip to; empty when the line names none. */
function attributedVectorIds(line: string): string[] {
  return [...line.matchAll(VECTOR_ATTRIBUTION_RE)]
    .flatMap((match) => match[1].split(VECTOR_LIST_SEPARATOR_RE))
    .filter((token) => VECTOR_ID_TOKEN_RE.test(token))
}

/**
 * True when the static skip at `lines[skipIndex]` is attributed to `id` — its title line or, when
 * that names none, its nearest preceding non-blank line is a comment naming `id` via `Vector <id>`,
 * or is not a comment naming a vector.
 */
function isSkipAttributedTo(lines: readonly string[], skipIndex: number, id: string): boolean {
  const own = attributedVectorIds(lines[skipTitleIndex(lines, skipIndex) ?? skipIndex])
  if (own.length > 0) return own.includes(id)
  for (let i = skipIndex - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line === '') continue
    if (!COMMENT_LINE_RE.test(line)) return true
    const attributed = attributedVectorIds(line)
    return attributed.length === 0 || attributed.includes(id)
  }
  return true
}

/** True when the spec source holds a static skip attributed to `id`. */
function hasStaticSkipForId(source: string, id: string): boolean {
  const lines = source.split(/\r\n|\n/)
  return lines.some((_, i) => isStaticSkipLine(lines, i) && isSkipAttributedTo(lines, i, id))
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
    .filter((r) => hasStaticSkipForId(readSpec((r[3] ?? '').trim()), (r[0] ?? '').trim()))
    .map((r) => (r[0] ?? '').trim())
}
