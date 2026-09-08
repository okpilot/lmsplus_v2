// Unit test for the commit-claims guard. Run:
//   node --test .claude/hooks/check-commit-claims.test.mjs
// Every test below is written to go RED if the mechanism it pins is deleted from
// check-commit-claims.mjs — see the mutation checks recorded in the commit that
// added this file.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { classifyRef, extractRefs } from './check-commit-claims.mjs'

const HOOK_PATH = fileURLToPath(new URL('./check-commit-claims.mjs', import.meta.url))

// A 40-char hex string built from a repeating digit+letter cycle — always a valid
// candidate shape (mixed digit and a-f letter), regardless of test-local length needs.
const HEX40 = '0123456789abcdef'.repeat(3).slice(0, 40)
const HEX40_ALT = 'fedcba9876543210'.repeat(3).slice(0, 40)

// ---- extractRefs ----------------------------------------------------------

test('extractRefs finds bare (non-backticked) refs after a commit-context word', () => {
  const refs = extractRefs('Fix applied in 269667d7 and reviewed on 7a4580ab today.')
  assert.deepEqual(refs, ['269667d7', '7a4580ab'])
})

test('extractRefs finds a possessive ref', () => {
  const refs = extractRefs("See 3a50780a's message for context.")
  assert.deepEqual(refs, ['3a50780a'])
})

test('extractRefs finds a bare line-start ref in a list item', () => {
  const refs = extractRefs('Summary:\n- d4e5f6a7 fixes the timeout\n- unrelated line\n')
  assert.deepEqual(refs, ['d4e5f6a7'])
})

test('extractRefs does NOT flag a token that precedes a preposition (content digest, not a citation)', () => {
  const refs = extractRefs(
    '714eec4f in plan-critic.md against 3e0bfa5f in implementation-critic.md',
  )
  assert.ok(!refs.includes('714eec4f'))
  assert.ok(!refs.includes('3e0bfa5f'))
})

test('extractRefs does NOT flag SHAs inside a URL', () => {
  const refs = extractRefs(
    `Bumps foo from 1.0 to 1.1.\nhttps://github.com/foo/bar/compare/${HEX40}...${HEX40_ALT}`,
  )
  assert.deepEqual(refs, [])
})

// The Dependabot-shaped test above is a real requirement, but it is NOT mutation-sensitive
// to URL-stripping specifically: a compare-URL SHA is always preceded by "compare/" and
// never qualifies via any of the three position rules on its own, with or without
// stripping (confirmed by replaying every historical commit message in this repo through
// both the stripped and unstripped path: 0 of 1275 differ). This test IS sensitive: a
// hex-looking URL path segment immediately followed by `'s` would otherwise satisfy the
// possessive rule, so it proves the URL-strip step runs before candidate extraction.
test('extractRefs does NOT flag a hex path segment inside a URL that looks possessive', () => {
  const refs = extractRefs("Verified per https://github.com/foo/1234567a's-diff for details.")
  assert.deepEqual(refs, [])
})

test('extractRefs ignores tokens that are all digits or all letters (no mixed digit+letter)', () => {
  const refs = extractRefs('reported per 1234567890 and confirmed per abcdefabcd today.')
  assert.deepEqual(refs, [])
})

test('extractRefs ignores refs inside a fenced code block', () => {
  const refs = extractRefs(
    'Before code.\n```\nfixed commit aaaaaaa1 today\n```\nAfter, reviewed per bbbbbbb2 today.',
  )
  assert.deepEqual(refs, ['bbbbbbb2'])
})

// ---- classifyRef ------------------------------------------------------------

test('classifyRef: exit 0 -> resolved', () => {
  const runner = () => ({ status: 0, stderr: '' })
  assert.equal(classifyRef('269667d7', runner), 'resolved')
})

test('classifyRef: "is ambiguous" stderr -> ambiguous', () => {
  const runner = () => ({
    status: 128,
    stderr: 'error: short SHA1 269667d is ambiguous\nfatal: Needed a single revision\n',
  })
  assert.equal(classifyRef('269667d', runner), 'ambiguous')
})

test('classifyRef: "Needed a single revision" stderr -> absent', () => {
  const runner = () => ({ status: 128, stderr: 'fatal: Needed a single revision\n' })
  assert.equal(classifyRef('deadbeef', runner), 'absent')
})

test('classifyRef: "not a git repository" stderr -> error (abort)', () => {
  const runner = () => ({
    status: 128,
    stderr: 'fatal: not a git repository (or any of the parent directories): .git\n',
  })
  assert.equal(classifyRef('269667d7', runner), 'error')
})

test('classifyRef: an unrecognised non-zero outcome -> error, never resolved (fail closed)', () => {
  const runner = () => ({ status: 1, stderr: 'some totally unexpected message\n' })
  assert.equal(classifyRef('269667d7', runner), 'error')
})

// ---- main() -------------------------------------------------------------------

test('extractRefs finds a bare parenthetical citation', () => {
  assert.deepEqual(extractRefs('The master-merge (fb06ee55) kept stale copies.'), ['fb06ee55'])
})

test('extractRefs ignores a third-party action pin cited parenthetically', () => {
  assert.deepEqual(extractRefs('Pinned actions:\n- actions/checkout@v6 (de0fac2)\n'), [])
})

test('extractRefs keeps a citation when unrelated scope@ref prose shares the line', () => {
  // A line-wide action-pin test made this a SILENT DROP: exit 0, "0 refs verified".
  assert.deepEqual(extractRefs('reverted the email/templates@v2 rename (fb06ee55) today'), [
    'fb06ee55',
  ])
})

test('extractRefs isolates the opening-paren boundary', () => {
  assert.deepEqual(extractRefs('Reworked the parser (see ab12cd34)'), [])
})

test('extractRefs isolates the closing-paren boundary', () => {
  assert.deepEqual(extractRefs('Reworked the parser (ab12cd34 notes)'), [])
})

test('extractRefs ignores hex inside parens that carry other prose', () => {
  assert.deepEqual(extractRefs('Reworked the parser (see ab12cd34 notes).'), [])
})

test('main: a missing/unreadable commit-msg file exits non-zero', () => {
  // Asserting the guard's OWN message, not merely a non-zero exit: an uncaught
  // ENOENT also exits non-zero, so an exit-code-only assertion passes with the
  // read guard deleted and cannot tell a clean abort from a raw stack trace.
  assert.throws(
    () => {
      execFileSync(process.execPath, [HOOK_PATH, '/nonexistent/path/does-not-exist'], {
        encoding: 'utf8',
        stdio: 'pipe',
      })
    },
    (err) => /could not read/.test(String(err.stderr)),
  )
})

test('main: a git "error" outcome (no repo) exits non-zero and does not report success', () => {
  const dir = mkdtempSync(join(tmpdir(), 'commit-claims-'))
  try {
    const msgFile = join(dir, 'MSG')
    writeFileSync(msgFile, 'fixes bug per 1234567a\n')
    let threw = false
    let stdout = ''
    try {
      stdout = execFileSync(process.execPath, [HOOK_PATH, msgFile], { cwd: dir, encoding: 'utf8' })
    } catch (err) {
      threw = true
      assert.notEqual(err.status, 0)
      stdout = err.stdout ?? ''
    }
    assert.ok(threw, 'expected a non-zero exit when git cannot run')
    assert.ok(!stdout.includes('✓'), 'must not report success when the check could not run')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
