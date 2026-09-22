// Unit tests for the shared, pure git-diff parser (.claude/hooks/diff-parse.mjs). A library, not a
// guard: no CONTROL:red/green pair, no pipeline.json `guards` entry — check-test-title-leakage.mjs
// is its first consumer and carries the wiring.
// Run: node --test .claude/hooks/diff-parse.test.mjs

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addedLines,
  DIFF_ARGS,
  GIT_NAMED_ESCAPES,
  GIT_QUOTEPATH,
  headerNewPath,
  splitByFile,
  unquoteGitPath,
} from './diff-parse.mjs'

// ---------------------------------------------------------------- constants

test('DIFF_ARGS carries every flag a content diff must pass', () => {
  for (const flag of [
    '--no-textconv',
    '--no-ext-diff',
    '--no-color',
    '--src-prefix=a/',
    '--dst-prefix=b/',
  ]) {
    assert.ok(DIFF_ARGS.includes(flag), flag)
  }
  assert.ok(Object.isFrozen(DIFF_ARGS))
})

test('GIT_QUOTEPATH disables quoting of non-ASCII bytes', () => {
  assert.deepEqual(GIT_QUOTEPATH, ['-c', 'core.quotePath=false'])
  assert.ok(Object.isFrozen(GIT_QUOTEPATH))
})

// GROUP: named-escapes-table-not-frozen
test('GIT_NAMED_ESCAPES is frozen against mutation', () => {
  // MUTATION: drop Object.freeze() from GIT_NAMED_ESCAPES → a future edit could silently add or
  // overwrite an escape entry at runtime, with no signal that the table was meant to be fixed.
  assert.ok(Object.isFrozen(GIT_NAMED_ESCAPES))
})

// ---------------------------------------------------------------- unquoteGitPath

// GROUP: cr-escape-undecoded
test('unquoteGitPath decodes a carriage-return escape', () => {
  // MUTATION: drop `r: 0x0d` from GIT_NAMED_ESCAPES → this goes red.
  assert.equal(unquoteGitPath('"x\\ry"'), 'x\ry')
})

// GROUP: backspace-escape-undecoded
test('unquoteGitPath decodes a backspace escape', () => {
  // MUTATION: drop `b: 0x08` from GIT_NAMED_ESCAPES → git's named \b escape falls through the
  // octal branch (fails, "b" is not [0-7]{3}), emitting the backslash and a literal 'b' instead
  // of one backspace byte.
  assert.equal(unquoteGitPath('"x\\by"'), 'x\by')
})

test('unquoteGitPath decodes a three-digit octal escape (UTF-8 byte sequence)', () => {
  assert.equal(unquoteGitPath('"caf\\303\\251"'), 'café')
})

test('unquoteGitPath keeps an unknown escape as a literal backslash', () => {
  assert.equal(unquoteGitPath('"x\\qy"'), 'x\\qy')
})

// GROUP: literal-char-single-byte
test('unquoteGitPath keeps a literal non-ASCII character beside an escaped double quote', () => {
  // MUTATION: push one UTF-16 code unit as a single byte instead of its UTF-8 encoding → a
  // literal non-ASCII character next to a quoted escape decodes as U+FFFD.
  assert.equal(unquoteGitPath('"é\\"x"'), 'é"x')
})

// GROUP: literal-char-single-byte, astral-char-split
test('unquoteGitPath keeps a literal astral character beside an escaped double quote', () => {
  // MUTATION: drop the surrogate-pair length skip → the loop revisits the low surrogate alone
  // and appends U+FFFD instead of completing the astral character.
  assert.equal(unquoteGitPath('"\u{1f680}\\"x"'), '\u{1f680}"x')
})

test('unquoteGitPath returns an unquoted token unchanged', () => {
  assert.equal(unquoteGitPath('plain/path.ts'), 'plain/path.ts')
})

// ---------------------------------------------------------------- headerNewPath

test('headerNewPath reads the bare form', () => {
  assert.equal(headerNewPath('diff --git a/old.test.ts b/new.test.ts'), 'new.test.ts')
})

test('headerNewPath reads a both-quoted header and unquotes the new path', () => {
  assert.equal(
    headerNewPath('diff --git "a/caf\\303\\251.test.ts" "b/caf\\303\\251.test.ts"'),
    'café.test.ts',
  )
})

// GROUP: quoted-header-unrecognised
test('headerNewPath decodes a carriage-return escape in a quoted header', () => {
  // MUTATION: drop the quoted-header branch from headerNewPath → this and every other
  // quoted-header case below go red.
  assert.equal(headerNewPath('diff --git "a/x\\ry.ts" "b/x\\ry.ts"'), 'x\ry.ts')
})

test('headerNewPath returns null for a mixed bare/quoted header (unparseable)', () => {
  assert.equal(headerNewPath('diff --git a/x.ts "b/y\\"z.ts"'), null)
})

test('headerNewPath returns null for a line that is not a diff header', () => {
  assert.equal(headerNewPath('+  it("ok")'), null)
})

// GROUP: bare-header-branch-dropped
test('splitByFile keys a bare diff --git header by the new path', () => {
  // MUTATION: drop the bare-header branch from headerNewPath → every ordinary (non-quoted)
  // header in a diff is unparsed and the file is silently dropped.
  const diff = ['diff --git a/a.ts b/a.ts', '@@ -0,0 +1 @@', '+x'].join('\n')
  assert.equal(splitByFile(diff)[0].file, 'a.ts')
})

// ---------------------------------------------------------------- splitByFile

test('splitByFile separates a multi-file diff by new path', () => {
  const diff = [
    'diff --git a/a.test.ts b/a.test.ts',
    '@@ -0,0 +1 @@',
    '+x',
    'diff --git a/b.test.ts b/b.test.ts',
    '@@ -0,0 +1 @@',
    '+y',
  ].join('\n')
  const parts = splitByFile(diff)
  assert.equal(parts.length, 2)
  assert.equal(parts[0].file, 'a.test.ts')
  assert.equal(parts[1].file, 'b.test.ts')
  assert.equal(parts[0].body, '@@ -0,0 +1 @@\n+x\n')
})

// GROUP: quoted-header-unrecognised
test('splitByFile keys a quoted diff --git header by the decoded new path', () => {
  const diff = [
    'diff --git "a/weird\\"name.test.ts" "b/weird\\"name.test.ts"',
    '@@ -0,0 +1 @@',
    '+x',
  ].join('\n')
  const parts = splitByFile(diff)
  assert.equal(parts.length, 1)
  assert.equal(parts[0].file, 'weird"name.test.ts')
})

// ---------------------------------------------------------------- addedLines

test('addedLines picks up only added lines with new-file line numbers', () => {
  const body = ['@@ -10,0 +11,2 @@', '+one', '+two'].join('\n')
  const found = addedLines(body)
  assert.deepEqual(
    found.map((r) => [r.line, r.text]),
    [
      [11, 'one'],
      [12, 'two'],
    ],
  )
})

test('addedLines ignores removed and context lines', () => {
  const body = ['@@ -5,2 +5,1 @@', '-removed', ' context'].join('\n')
  assert.deepEqual(addedLines(body), [])
})

// GROUP: added-line-number-not-advanced
test('addedLines advances the new-file line number for each added line', () => {
  // MUTATION: drop `newLine += 1` after pushing an added line → every added line in a run
  // reports the SAME new-file line number as the first.
  const body = ['@@ -0,0 +1,3 @@', '+a', '+b', '+c'].join('\n')
  assert.deepEqual(
    addedLines(body).map((r) => r.line),
    [1, 2, 3],
  )
})

// GROUP: added-line-number-not-advanced
test('addedLines resets the new-file line number at a second hunk header', () => {
  const body = ['@@ -1,0 +5,1 @@', '+x', '@@ -10,0 +20,1 @@', '+y'].join('\n')
  assert.deepEqual(
    addedLines(body).map((r) => r.line),
    [5, 20],
  )
})

// GROUP: context-line-number-not-advanced
test('addedLines advances the new-file line number across a context line', () => {
  // MUTATION: drop `newLine += 1` from the context/removed branch → an added line after a
  // context line is attributed to the WRONG new-file line number.
  const body = ['@@ -1,1 +1,2 @@', ' context', '+added'].join('\n')
  assert.deepEqual(addedLines(body)[0].line, 2)
})

test('addedLines does not advance the new-file line number across a removed line', () => {
  const body = ['@@ -1,1 +1,1 @@', '-removed', '+added'].join('\n')
  assert.deepEqual(addedLines(body)[0].line, 1)
})

test('addedLines ignores a "\\ No newline at end of file" marker', () => {
  const body = ['@@ -0,0 +1 @@', '+last', '\\ No newline at end of file'].join('\n')
  assert.deepEqual(
    addedLines(body).map((r) => r.text),
    ['last'],
  )
})

// GROUP: trailing-cr-not-stripped
test('addedLines strips a trailing carriage return from added text', () => {
  // MUTATION: drop the `.replace(/\r$/, '')` on added text → a CRLF-sourced added line carries
  // a trailing \r that a caller's own pattern was never written to expect.
  const body = '@@ -0,0 +1 @@\n+line\r'
  assert.equal(addedLines(body)[0].text, 'line')
})

test('addedLines skips +++/--- file-header lines before the first hunk', () => {
  const body = ['--- a/x', '+++ b/x', '@@ -0,0 +1 @@', '+real'].join('\n')
  assert.deepEqual(
    addedLines(body).map((r) => r.text),
    ['real'],
  )
})

// GROUP: plus-plus-content-not-a-header
test('addedLines scans an added line whose own content starts with ++ once a hunk has begun', () => {
  // MUTATION: drop the `sawHunk` gate on the +++/--- skip → an added line whose own content
  // starts with `++` (diff-line `+++<content>`) is misread as a file header and silently
  // dropped, once hunks have already started.
  const body = ['@@ -0,0 +1 @@', '+++real content'].join('\n')
  assert.deepEqual(
    addedLines(body).map((r) => r.text),
    ['++real content'],
  )
})

// GROUP: hunk-header-does-not-break-run
test('addedLines starts a new run at a hunk header even with no separating line', () => {
  // MUTATION: drop `run += 1` from the hunk-header branch → two added lines either side of a
  // hunk boundary, with no context/removed line between them, share one `run` value and a
  // caller joins them as if they were adjacent in the source.
  const body = ['@@ -0,0 +1 @@', '+a', '@@ -5,0 +7 @@', '+b'].join('\n')
  const [first, second] = addedLines(body)
  assert.notEqual(first.run, second.run)
})

// GROUP: context-or-removed-does-not-break-run
test('addedLines breaks the run on a removed line between two added lines', () => {
  // MUTATION: drop `run += 1` from the context/removed branch → a removed line no longer
  // separates the added lines around it into distinct runs.
  const body = ['@@ -1,1 +1,2 @@', '+a', '-removed', '+b'].join('\n')
  const [first, second] = addedLines(body)
  assert.notEqual(first.run, second.run)
})

// GROUP: context-or-removed-does-not-break-run
test('addedLines breaks the run on a context line between two added lines', () => {
  const body = ['@@ -1,1 +1,3 @@', '+a', ' context', '+b'].join('\n')
  const [first, second] = addedLines(body)
  assert.notEqual(first.run, second.run)
})

test('addedLines keeps a contiguous stretch of added lines in one run', () => {
  const body = ['@@ -0,0 +1,3 @@', '+a', '+b', '+c'].join('\n')
  const runs = new Set(addedLines(body).map((r) => r.run))
  assert.equal(runs.size, 1)
})
