// Shared, pure git-diff parser. No spawn — callers own how the diff text is produced. Extracted
// from check-test-title-leakage.mjs so every future guard reads a diff the same way: immune to
// textconv, external-diff, `diff.noprefix` and `color.ui` config, and to git's C-quoting of paths
// carrying a `"`, a `\`, or a control character.

/**
 * The flags every CONTENT diff a guard parses must carry, appended after the `diff` subcommand.
 * `--no-textconv`/`--no-ext-diff` stop a repo-local driver from hiding or rewriting the text this
 * module reads; `--no-color` keeps added/context/removed markers at column 0; the prefixes pin the
 * `a/`/`b/` header this module's header regexes anchor on against `diff.noprefix=true`, which
 * otherwise emits `diff --git <path> <path>` with no prefix on a two-treeish comparison (where
 * `diff.mnemonicPrefix` never applies).
 */
export const DIFF_ARGS = Object.freeze([
  '--no-textconv',
  '--no-ext-diff',
  '--no-color',
  '--src-prefix=a/',
  '--dst-prefix=b/',
])

/** `-c core.quotePath=false`: a non-ASCII byte in a path is no longer C-quoted. `"`, `\` and
 * control characters are always quoted regardless — headerNewPath()/unquoteGitPath() handle those. */
export const GIT_QUOTEPATH = Object.freeze(['-c', 'core.quotePath=false'])

/** git's named C-escapes in a quoted path token, keyed by the character after the backslash. */
export const GIT_NAMED_ESCAPES = Object.freeze({
  '\\': 0x5c,
  '"': 0x22,
  t: 0x09,
  n: 0x0a,
  a: 0x07,
  b: 0x08,
  f: 0x0c,
  r: 0x0d,
  v: 0x0b,
})

/**
 * Undo git's C-quoting of a `diff --git` path token. `core.quotePath=false` (part of
 * `GIT_QUOTEPATH`, passed by every caller) stops non-ASCII bytes from being quoted, but `"`, `\`
 * and control characters are ALWAYS quoted regardless — so a quoted token can still reach here.
 * @param {string} token the token exactly as git printed it, surrounding quotes included
 * @returns {string} the literal token with quoting undone
 */
export function unquoteGitPath(token) {
  if (token.length < 2 || token[0] !== '"' || token[token.length - 1] !== '"') return token
  const inner = token.slice(1, -1)
  const bytes = []
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] !== '\\') {
      const ch = String.fromCodePoint(inner.codePointAt(i))
      bytes.push(...Buffer.from(ch, 'utf8'))
      i += ch.length - 1
      continue
    }
    const oct = inner.slice(i + 1, i + 4)
    if (/^[0-7]{3}$/.test(oct)) {
      bytes.push(Number.parseInt(oct, 8))
      i += 3
      continue
    }
    const named = GIT_NAMED_ESCAPES[inner[i + 1]]
    if (named !== undefined) {
      bytes.push(named)
      i += 1
    } else {
      bytes.push(0x5c)
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

/**
 * The NEW-side path from one `diff --git` header line — bare (`a/x b/y`) or, when either side
 * needs C-quoting, quoted (`"a/x" "b/y"`). Only the both-bare and both-quoted shapes are
 * recognised; a mixed rename (one side quoted, the other bare) falls through as unparsed, same as
 * any other header this module cannot read.
 * @returns {string | null}
 */
export function headerNewPath(line) {
  const bare = /^diff --git a\/.+ b\/(.+)$/.exec(line)
  if (bare) return bare[1]
  const quoted = /^diff --git "a\/(?:[^"\\]|\\.)*" ("b\/(?:[^"\\]|\\.)*")$/.exec(line)
  return quoted ? unquoteGitPath(quoted[1]).slice(2) : null
}

/**
 * Split a multi-file `git diff` into per-file bodies keyed by the new path.
 * @param {string} diff
 * @returns {{ file: string, body: string }[]}
 */
export function splitByFile(diff) {
  const out = []
  let current = null
  for (const line of diff.split('\n')) {
    const path = headerNewPath(line)
    if (path !== null) {
      if (current) out.push(current)
      current = { file: path, body: '' }
    } else if (current) {
      current.body += `${line}\n`
    }
  }
  if (current) out.push(current)
  return out
}

/**
 * Every ADDED line of one file's diff body (`-U0` output), with its new-file line number and a
 * `run` counter a caller uses to join a contiguous stretch of added lines (e.g. a call opening on
 * one added line and its argument on the next). `run` increments on any line that is NOT itself an
 * added line — a hunk header, a context or removed line — so two entries sharing the same `run`
 * value were adjacent `+` lines with nothing else between them.
 *
 * `+++`/`---` file-header lines are skipped only BEFORE the first `@@` — once hunks have started,
 * an added line whose own content happens to start with `++` (diff-line `+++<content>`) is still
 * scanned. `\ No newline at end of file` lines are ignored outright: they break nothing and are
 * never added content. A trailing `\r` is stripped from added text (CRLF source files).
 *
 * @param {string} body one file's diff body, as split out by `splitByFile`
 * @returns {{ line: number, text: string, run: number }[]}
 */
export function addedLines(body) {
  const results = []
  let newLine = 0
  let sawHunk = false
  let run = 0
  for (const raw of body.split('\n')) {
    if (raw.startsWith('@@')) {
      run += 1
      sawHunk = true
      const m = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
      if (m) newLine = Number(m[1])
      continue
    }
    if (!sawHunk && (raw.startsWith('+++') || raw.startsWith('---'))) continue
    if (raw.startsWith('+')) {
      results.push({ line: newLine, text: raw.slice(1).replace(/\r$/, ''), run })
      newLine += 1
      continue
    }
    if (raw.startsWith('\\')) continue
    run += 1
    if (!raw.startsWith('-')) newLine += 1
  }
  return results
}
