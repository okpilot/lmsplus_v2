// Run: node --test .claude/hooks/run-mutations.spawn.test.mjs
//
// `assertSpawnUsable` — how a finished `spawnSync` result is read, before anything is graded.
//
// A SIBLING file, not a section of `run-mutations.test.mjs`: that suite is near its cap in
// `.claude/limits.json`, and the split is the house pattern (`check-retracted-phrase` ships
// `.test.mjs` + `.repo.test.mjs`). Both suites are listed in `run-mutations.mutations.json`, so a
// break in either is graded by the harness itself.
//
// This logic was inside `runMutation` until the extraction, where the suite header's own scope
// note put it beyond reach of every test — the shape `code-style.md` § "A Test Must Fail If Its
// Mechanism Is Removed" is about. The measured basis for the branch order, re-derivable by
// running the matrix in the commit that added it: a timeout sets `error` (code ETIMEDOUT) AND
// `signal`; a spawn failure sets `error` alone; an external kill sets `signal` alone.
//
// Every case is MUTATION-PINNED: the opening comment names the break that turns THAT test red.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { assertSpawnUsable } from './run-mutations.mjs'

// Absolute path to the harness itself — needed so a subprocess invoked with a DIFFERENT cwd can
// still find the script. `import.meta.url` is always this file's own URL regardless of cwd.
const HARNESS = fileURLToPath(new URL('./run-mutations.mjs', import.meta.url))

const timedOut = () => ({
  error: Object.assign(new Error('spawnSync node ETIMEDOUT'), { code: 'ETIMEDOUT' }),
  signal: 'SIGKILL',
})

// MUTATION: delete the `if (r.error.code === 'ETIMEDOUT')` block in assertSpawnUsable.
// The generic branch then reports a spawn failure for a spawn that succeeded.
test('names the timeout, not the spawn, when a suite runs long', () => {
  assert.throws(() => assertSpawnUsable('m1', timedOut(), 120000), /suite run exceeded 120000ms/)
})

// MUTATION: in the ETIMEDOUT throw, drop `${timeoutMs}ms` from the message.
// A reader then cannot tell which budget was exceeded.
test('reports the budget that was exceeded, not merely that one was', () => {
  assert.throws(() => assertSpawnUsable('m1', timedOut(), 4500), /4500ms/)
})

// MUTATION: in the ETIMEDOUT throw, replace 'NO VERDICT' with 'SURVIVED'.
// A harness failure would then read as a finding about the tests.
test('declares no verdict on a timeout rather than a result', () => {
  assert.throws(() => assertSpawnUsable('m1', timedOut(), 120000), /NO VERDICT/)
})

// MUTATION: change `if (r.error)` to `if (false)` in assertSpawnUsable.
// A timeout sets BOTH fields, so it then falls through to the signal branch, which says in so
// many words that no timeout was reported — the precise inversion the branch order prevents.
test('prefers the timeout over the signal when a timeout set both', () => {
  assert.throws(
    () => assertSpawnUsable('m1', timedOut(), 120000),
    (err) => {
      assert.doesNotMatch(err.message, /no timeout reported/)
      return true
    },
  )
})

// MUTATION: delete the generic `throw` that follows the ETIMEDOUT block.
// A real spawn failure then returns as if the run were gradeable.
test('refuses a run whose binary never started', () => {
  const r = { error: Object.assign(new Error('spawnSync node ENOENT'), { code: 'ENOENT' }) }
  assert.throws(() => assertSpawnUsable('spawn-enoent-id', r, 120000), /could not spawn node/)
  assert.throws(() => assertSpawnUsable('spawn-enoent-id', r, 120000), /spawn-enoent-id/)
})

// MUTATION: delete the whole `if (r.signal)` block.
// An externally killed run then reaches the TAP parse with truncated output.
test('refuses a run killed by something other than the timeout', () => {
  assert.throws(
    () => assertSpawnUsable('kill-signal-id', { signal: 'SIGKILL' }, 120000),
    /killed by SIGKILL \(no timeout reported\)/,
  )
  assert.throws(
    () => assertSpawnUsable('kill-signal-id', { signal: 'SIGKILL' }, 120000),
    /kill-signal-id/,
  )
})

// MUTATION: change `if (r.error)` to `if (r.error !== undefined)` in assertSpawnUsable.
// An explicit `error: null` then enters the block and dereferences it, so a run that merely
// finished raises a TypeError instead of being graded. Truthiness is what makes both absent
// shapes — `undefined` and `null` — mean the same thing here.
test('grades a run that finished on its own, whether it passed or failed', () => {
  assert.doesNotThrow(() => assertSpawnUsable('m1', { status: 0, signal: null }, 120000))
  assert.doesNotThrow(() => assertSpawnUsable('m1', { status: 1, signal: null }, 120000))
  assert.doesNotThrow(() =>
    assertSpawnUsable('m1', { error: null, status: 0, signal: null }, 120000),
  )
})

// MUTATION: interpolate a literal in place of `${mutId}` in the timeout throw.
// A failing run in a batch this size — `node .claude/hooks/run-mutations.mjs` reports the total
// it actually ran — then cannot be traced to the mutation that caused it.
// (The fixture is timedOut() — only the ETIMEDOUT path is reached; the other two throws are
// pinned implicitly by tests 5 and 6 above, which use distinctive mutIds and assert they appear.)
test('names which mutation failed, so one bad run in a batch is findable', () => {
  assert.throws(
    () => assertSpawnUsable('drop-skip-directive-filter', timedOut(), 1),
    /drop-skip-directive-filter/,
  )
})

// MUTATION: delete the `if (r == null)` guard at the top of assertSpawnUsable.
// A null result then dereferences to a TypeError naming a property, which says nothing about
// which mutation produced it — the one thing every other message here is careful to say.
test('refuses a result that is not there at all, rather than dereferencing it', () => {
  assert.throws(() => assertSpawnUsable('absent-id', null, 120000), /absent-id: no spawn result/)
  assert.throws(
    () => assertSpawnUsable('absent-id', undefined, 120000),
    /absent-id: no spawn result/,
  )
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Per-mutation fault isolation in modeRun
//
// modeRun is not exported and main() resolves the repo root via repoRoot() — a zero-parameter
// closure over `git rev-parse --show-toplevel` with NO explicit cwd, so it inherits the process
// cwd. Spawning the harness with a temp git repo as cwd routes the entire execution through that
// repo's data files, reaching modeRun's try/catch without touching production code.
//
// Both cases the notEncoded entries called unpinnable are in fact reachable this way, and BOTH
// are now pinned: the fault-isolation case by the fixture below (a data file with one stale
// anchor), and the no-data-files case by the third test at the end of this file (a temp repo
// whose `.claude/hooks/` exists but is EMPTY, so selectFiles returns [] and the guard fires).
// An earlier draft of THIS comment asserted the second was "unreachable even via spawn" and
// reasoned that modeRun's loop body never executes — which confuses a consequence of the throw
// with the guard being unreachable. It was falsified by a test added in the same commit and is
// retracted here rather than left to be discovered: §10 cl.3, for the third time on this branch.
//
// Fixture: two mutations in one data file.
//   - stale-anchor: `find` matches nothing → assertSingleOccurrence throws → FAULT
//   - valid-survivor: `find` matches; mutation applied; suite runs clean; expectRed names a test
//     that never fails → SURVIVED (bad++)
// Result: total=2, faults=1, bad=1.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Create a temp git repo with a committed target + suite, plus an uncommitted data file whose
 * first mutation has a stale anchor (will fault) and whose second has a valid anchor (will
 * survive — expectRed names a test the clean suite never produces).
 * Returns the repo root path. Caller is responsible for cleanup.
 */
function buildFaultFixtureRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'rm-fault-fixture-'))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@test',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@test',
  }
  const g = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', env })

  writeFileSync(join(dir, 'target.mjs'), 'export const x = 1\n')
  // Raw TAP output, not `import test from 'node:test'`: when the harness is itself invoked
  // from a `node --test` process, NODE_TEST_CONTEXT is set in the environment and causes
  // every nested `node --test` subprocess to emit a "called recursively" warning and produce
  // no plan line — so parseTap throws and the mutation is counted as a FAULT for the wrong
  // reason. Writing TAP directly sidesteps that inherited environment variable.
  writeFileSync(
    join(dir, 'suite.test.mjs'),
    "process.stdout.write('TAP version 13\\n1..1\\nok 1 - placeholder\\n')\n",
  )
  g(['init'])
  g(['config', 'user.email', 'test@test'])
  g(['config', 'user.name', 'test'])
  g(['add', 'target.mjs', 'suite.test.mjs'])
  g(['commit', '-m', 'init'])

  // The data file is NOT committed — selectFiles reads the working tree directly, not the
  // worktree, so the data file only needs to be on disk, not in git history.
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true })
  writeFileSync(
    join(dir, '.claude', 'hooks', 'fixture.mutations.json'),
    JSON.stringify({
      target: 'target.mjs',
      suites: ['suite.test.mjs'],
      mutations: [
        {
          id: 'stale-anchor',
          find: 'THIS TEXT IS NOT IN THE FILE',
          replace: 'anything',
          expectRed: ['placeholder'],
        },
        {
          id: 'valid-survivor',
          find: 'export const x = 1',
          replace: 'export const x = 2',
          expectRed: ['a-test-that-never-fails'],
        },
      ],
    }),
  )
  return dir
}

// Built once; both fault-isolation tests read from it.
const faultFixtureDir = buildFaultFixtureRepo()
// Strip NODE_TEST_CONTEXT so the harness's own `node --test` spawns are not seen as recursive
// by the host test runner. Without this, every suite subprocess inherits the context flag, emits
// "called recursively, skipping", produces no plan line, and is counted as a FAULT — defeating
// the fixture's purpose of having exactly one fault and one gradeable mutation.
const { NODE_TEST_CONTEXT: _ntc, ...envWithoutTestContext } = process.env
const faultRun = spawnSync('node', [HARNESS], {
  cwd: faultFixtureDir,
  encoding: 'utf8',
  env: envWithoutTestContext,
})
// Cleanup on exit — not a test concern if this leaks in a crash, but keep it tidy on success.
process.once('exit', () => {
  try {
    rmSync(faultFixtureDir, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
})

// MUTATION: delete the try/catch wrapping runMutation in gradeOne (the fault-isolation block).
// MUTATION: set `timeout:` in runMutation's spawnSync to 1 instead of SUITE_TIMEOUT_MS — the
// fixture's valid mutation then times out too, so BOTH fault and the count reads 2, not 1.
// That second break is what pins the timeout OPTION itself: every other encoded recipe drives
// assertSpawnUsable with a synthetic result and never touches the real spawnSync call.
// Without the catch, the stale anchor throws through modeRun into main()'s outer handler, which
// logs "could not run — NO VERDICT" and exits 2 before the summary line is ever printed.
// stdout then contains NO "2 mutations run", so this assertion goes red.
test('grades every mutation after a stale-anchor fault, not just those before it', () => {
  assert.ok(faultRun.stdout.includes('2 mutations run'), `stdout:\n${faultRun.stdout}`)
  assert.ok(faultRun.stdout.includes('1 could not be graded'), `stdout:\n${faultRun.stdout}`)
})

// MUTATION: invert modeRun's exit order — check `bad` before `faults`.
// With faults=1 AND bad=1, `bad > 0` fires first and exits 1 ("your tests have a hole").
// Asserting 2 here pins the ORDER: a fault outranks a survivor ("this run proves nothing").
test('exits 2 when a batch carries both a fault and a survivor, not 1', () => {
  assert.equal(faultRun.status, 2, `stdout:\n${faultRun.stdout}\nstderr:\n${faultRun.stderr}`)
})

// A repo with `.claude/hooks/` present but EMPTY: `selectFiles` returns [], which is the one
// input that reaches the no-data-files guard. Built separately from the fault fixture, which
// must contain a data file.
function buildEmptyHooksRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'rm-empty-hooks-'))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@test',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@test',
  }
  const g = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', env })
  g(['init', '-q', '.'])
  g(['commit', '-q', '--allow-empty', '-m', 'init'])
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true })
  return dir
}

const emptyHooksDir = buildEmptyHooksRepo()
const emptyRun = spawnSync('node', [HARNESS], {
  cwd: emptyHooksDir,
  encoding: 'utf8',
  env: envWithoutTestContext,
})
process.once('exit', () => {
  try {
    rmSync(emptyHooksDir, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
})

// MUTATION: delete the `if (files.length === 0) { throw ... }` guard at the top of modeRun.
// The loop then iterates nothing, every counter stays 0, and the summary prints "0 mutations
// run, 0 caught" at exit 0 — the harness reporting success having graded NOTHING, which is the
// single false-green path the guard exists to close. Asserting exit 2 pins it.
test('refuses to report success when there was nothing at all to grade', () => {
  assert.equal(emptyRun.status, 2, `stdout:\n${emptyRun.stdout}\nstderr:\n${emptyRun.stderr}`)
  assert.match(emptyRun.stderr, /no \*\.mutations\.json data files found/)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// --coverage mode: claim sites and declared-not-encodable entries
//
// Fixture: a data file whose suite carries one test with 2 claim comments above it, 1 encoded
// mutation, and 1 notEncoded entry. Expected: claim sites=2, encoded=1, notEncoded=1.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

function buildCoverageFixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), 'rm-coverage-fixture-'))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@test',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@test',
  }
  const g = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', env })
  g(['init', '-q', '.'])
  g(['commit', '-q', '--allow-empty', '-m', 'init'])
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true })
  // Suite with one test and exactly 2 claim comments above it. Two, not one, so the reported
  // site count cannot coincide with the number of tests or of encoded mutations.
  writeFileSync(
    join(dir, '.claude', 'hooks', 'cov-suite.test.mjs'),
    '// MUTATION: first claim → red\n// MUTATION: second claim → red\n' +
      "test('the fixture behaviour', () => {})\n",
  )
  writeFileSync(
    join(dir, '.claude', 'hooks', 'cov.mutations.json'),
    JSON.stringify({
      target: 'placeholder.mjs',
      suites: ['.claude/hooks/cov-suite.test.mjs'],
      mutations: [{ id: 'a', find: 'x', replace: 'y', expectRed: ['t'] }],
      notEncoded: [
        { claim: 'MUTATION: something not encodable', why: 'lefthook.yml is not the target' },
      ],
    }),
  )
  return dir
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// --coverage mode: a dangling GROUP id is the failure, not a note
// ─────────────────────────────────────────────────────────────────────────────────────────────────

function buildDanglingFixtureDir() {
  const dir = buildCoverageFixtureDir()
  writeFileSync(
    join(dir, '.claude', 'hooks', 'cov-suite.test.mjs'),
    '// GROUP: no-such-mutation\n' + "test('the fixture behaviour', () => {})\n",
  )
  return dir
}

const danglingFixtureDir = buildDanglingFixtureDir()
const danglingRun = spawnSync('node', [HARNESS, '--coverage', '--guard', 'cov'], {
  cwd: danglingFixtureDir,
  encoding: 'utf8',
  env: envWithoutTestContext,
})

process.once('exit', () => {
  try {
    rmSync(danglingFixtureDir, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
})

// MUTATION: return 0 unconditionally from modeCoverage instead of `dangling === 0 ? 0 : 1`
// → a dangling id is still PRINTED, so every output assertion in this file stays green while the
// gate stops failing. Reporting a problem and exiting 0 is indistinguishable from no problem to
// every caller that reads the exit code, which is what CI and lefthook read.
// GROUP: coverage-dangling-exits-zero
test('a dangling GROUP id makes coverage mode exit non-zero, not merely print', () => {
  assert.ok(danglingRun.stdout.includes('DANGLING'), `stdout:\n${danglingRun.stdout}`)
  assert.equal(danglingRun.status, 1)
})

const coverageFixtureDir = buildCoverageFixtureDir()
const coverageRun = spawnSync('node', [HARNESS, '--coverage', '--guard', 'cov'], {
  cwd: coverageFixtureDir,
  encoding: 'utf8',
  env: envWithoutTestContext,
})
process.once('exit', () => {
  try {
    rmSync(coverageFixtureDir, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
})

// MUTATION: in parseSuite, attribute every claim to `header` instead of the nearest preceding
// test → the suite's two claims stop being claim sites and the report shows 0, so a suite full of
// claims reads as carrying none.
// GROUP: ownerfor-always-header
test('reports the claim sites a suite carries and the entries excused from encoding', () => {
  assert.ok(
    coverageRun.stdout.includes('claim sites (comment claims) : 2'),
    `stdout:\n${coverageRun.stdout}`,
  )
  assert.ok(
    coverageRun.stdout.includes('declared not-encodable       : 1'),
    `stdout:\n${coverageRun.stdout}`,
  )
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// --run validates the tree it grades
//
// Fixture: the COMMITTED suite carries a dangling GROUP id; the working tree has it removed.
// `--run` builds its worktree from HEAD, so it must read HEAD when validating too.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

function buildCommittedDanglingRepo() {
  const dir = buildFaultFixtureRepo()
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@test',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@test',
  }
  const g = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', env })
  const suite = join(dir, 'suite.test.mjs')
  const clean = readFileSync(suite, 'utf8')
  writeFileSync(suite, `// GROUP: no-such-mutation\n${clean}`)
  g(['add', 'suite.test.mjs'])
  g(['commit', '-m', 'dangling marker'])
  writeFileSync(suite, clean)
  return dir
}

const committedDanglingDir = buildCommittedDanglingRepo()
const committedDanglingRun = spawnSync('node', [HARNESS], {
  cwd: committedDanglingDir,
  encoding: 'utf8',
  env: envWithoutTestContext,
})
process.once('exit', () => {
  try {
    rmSync(committedDanglingDir, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
})

// MUTATION: drop the `committedSuite` argument from modeRun's surveySuites call, so validation
// falls back to the working-tree reader -> the working tree's marker-free suite passes the
// dangling check while the worktree built from HEAD still runs the suite that carries it.
// GROUP: run-validates-the-working-tree
test('a dangling GROUP id committed but not on disk still stops the grading run', () => {
  assert.notEqual(committedDanglingRun.status, 0)
  assert.match(
    `${committedDanglingRun.stdout}${committedDanglingRun.stderr}`,
    /no-such-mutation/,
    `stdout:\n${committedDanglingRun.stdout}\nstderr:\n${committedDanglingRun.stderr}`,
  )
})
