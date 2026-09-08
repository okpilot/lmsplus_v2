// Unit test for the commit-claims guard. Run:
//   node --test .claude/hooks/check-commit-claims.test.mjs
// Every test below is written to go RED if the mechanism it pins is deleted from
// check-commit-claims.mjs — see the mutation checks recorded in the commit that
// added this file.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { classifyRef, extractRefs } from './check-commit-claims.mjs'

const HOOK_PATH = fileURLToPath(new URL('./check-commit-claims.mjs', import.meta.url))
// Resolve the real repo root from the hook's own location (never process.cwd() — the
// test may be invoked from a different working directory) so the two end-to-end main()
// tests below can run the hook against real git history instead of a synthetic repo.
const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: dirname(HOOK_PATH),
  encoding: 'utf8',
}).trim()

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

test('extractRefs drops a "#" comment line before extraction (git template comments)', () => {
  const refs = extractRefs('# implemented per abc1234f\nActual body text.\n')
  assert.deepEqual(refs, [])
})

test('extractRefs drops trailer lines (Co-Authored-By / Claude-Session / Signed-off-by)', () => {
  assert.deepEqual(extractRefs('Body text here.\n\nCo-Authored-By: Bot per abc1234f\n'), [])
  assert.deepEqual(extractRefs('Body text here.\n\nClaude-Session: verified per abc1234f\n'), [])
  assert.deepEqual(extractRefs('Body text here.\n\nSigned-off-by: Someone per abc1234f\n'), [])
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

test('classifyRef: "unknown revision" stderr -> absent', () => {
  const runner = () => ({
    status: 128,
    stderr: 'fatal: unknown revision or path not in the working tree.\n',
  })
  assert.equal(classifyRef('deadbeef', runner), 'absent')
})

test('classifyRef: "not a valid object name" stderr -> absent', () => {
  const runner = () => ({
    status: 128,
    stderr: "fatal: not a valid object name 'deadbeef^{commit}'\n",
  })
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

test('extractRefs keeps a citation flanked by trigger words on BOTH sides', () => {
  // Regression: the precedes-a-trigger exclusion used to cancel unconditionally, so
  // "in <sha> of", "by <sha> to", "of <sha> on" — ordinary English, and the dominant
  // citation shape in this history — were SILENTLY DROPPED (exit 0, "0 refs verified").
  assert.deepEqual(extractRefs('documented in commit 1234567a of the plan'), ['1234567a'])
  assert.deepEqual(extractRefs('fixed by 80b0aaeb to restore behavior'), ['80b0aaeb'])
})

test('extractRefs still excludes a content digest at a line start', () => {
  // The exclusion survives for its ONE real case: the weakest position, bare line start.
  assert.deepEqual(extractRefs('714eec4f in plan-critic.md'), [])
})

test('extractRefs keeps a citation on an issue-reference line', () => {
  // `#1255` is content (71 such lines in the last 400 messages); only `# ` is a template comment.
  assert.deepEqual(extractRefs('#1255 - the defect was fixed by 1234567a since'), ['1234567a'])
})

test('extractRefs drops a git template comment line', () => {
  // The token must be one the filter ALONE excludes: `fixed by <sha> since` qualifies via
  // TRIGGER_BEFORE, so this goes red if the `#` filter is removed. An earlier fixture used
  // `with <sha> in it`, which no rule accepts anyway — it passed with the filter deleted.
  assert.deepEqual(extractRefs('# On branch master, fixed by 1234567a since'), [])
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

test('main: a git-check failure aborts before the unresolved-SHA report ever runs', () => {
  // Pins the collectOffenders extraction specifically. Its abort branch must exit(1) and
  // never fall through to the loop's push line. A regression that dropped only the exit()
  // call (leaving the surrounding push intact) would still exit non-zero — the 'error'
  // token is not 'resolved', so it gets pushed as an ordinary offender — but stderr would
  // then ALSO carry the generic "cites unresolved SHA(s)" report with an undefined remedy,
  // which never happens when the abort genuinely short-circuits before that code runs.
  // The sibling test above only checks for the absence of '✓'; it does not distinguish a
  // real abort from one that fell through into the generic report and still failed closed.
  const dir = mkdtempSync(join(tmpdir(), 'commit-claims-'))
  try {
    const msgFile = join(dir, 'MSG')
    writeFileSync(msgFile, 'fixes bug per 1234567a\n')
    let stderr = ''
    try {
      execFileSync(process.execPath, [HOOK_PATH, msgFile], { cwd: dir, encoding: 'utf8' })
      assert.fail('expected a non-zero exit when git cannot run')
    } catch (err) {
      assert.notEqual(err.status, 0)
      stderr = err.stderr ?? ''
    }
    assert.match(stderr, /could not verify '1234567a' — git check failed\. Aborting/)
    assert.ok(
      !stderr.includes('cites unresolved SHA(s)'),
      'abort must short-circuit before the generic offender report runs',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('main: a message citing HEAD exits 0 and prints the success line', () => {
  // Exercises main()'s only untested branch before this test existed: the happy path.
  // Every other main() test in this file drives a FAILURE branch.
  const head = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim()
  const dir = mkdtempSync(join(tmpdir(), 'commit-claims-'))
  try {
    const msgFile = join(dir, 'MSG')
    writeFileSync(msgFile, `Fix applied in ${head} today.\n`)
    const stdout = execFileSync(process.execPath, [HOOK_PATH, msgFile], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
    assert.match(stdout, /^✓ commit-claims guard: 1 ref\(s\) verified/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('main: a message citing an absent (but syntactically valid) SHA exits non-zero with the remedy', () => {
  // Distinct from the "no repo" test above: this drives the OFFENDERS branch (a real repo,
  // a real git check that runs cleanly and reports the ref does not exist) rather than the
  // "git check itself failed" branch — the two are different code paths in main().
  const absentSha = '0123456789abcdef'.repeat(3).slice(0, 40) // 40-char hex: never a real object
  const dir = mkdtempSync(join(tmpdir(), 'commit-claims-'))
  try {
    const msgFile = join(dir, 'MSG')
    writeFileSync(msgFile, `fixes bug per ${absentSha}\n`)
    let threw = false
    let stderr = ''
    try {
      execFileSync(process.execPath, [HOOK_PATH, msgFile], { cwd: REPO_ROOT, encoding: 'utf8' })
    } catch (err) {
      threw = true
      assert.notEqual(err.status, 0)
      stderr = err.stderr ?? ''
    }
    assert.ok(threw, 'expected a non-zero exit for an unresolved SHA citation')
    assert.match(stderr, new RegExp(`${absentSha}\\s+\\(absent\\)`))
    assert.match(stderr, /not in this repository — try `git fetch origin`/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
