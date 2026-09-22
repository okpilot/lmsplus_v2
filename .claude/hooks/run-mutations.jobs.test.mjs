// Run: node --test .claude/hooks/run-mutations.jobs.test.mjs
//
// `--jobs N`: `parseJobs`'s validation, `runPool`'s ordering/concurrency-bound guarantee,
// `spawnSuite`'s spawnSync-shaped async result, and the end-to-end R2 guarantee that output is
// byte-identical for any N. Also covers two #1331 outside-diff fixes landing in this same PR: R6
// (ref-based candidate enumeration survives a data file deleted from the WORKING TREE) and R7
// (`commit-tree` needs no inherited git identity). A SIBLING file, not a section of
// `run-mutations.staged.test.mjs`, which sits near its cap in `.claude/limits.json`
// (`--stats` before adding a line there).
//
// Every case carrying a mutation claim is pinned by a GROUP marker into
// `run-mutations.mutations.json` — `--coverage` is the check, not this sentence; a few smoke
// tests carry neither and claim no coverage.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseArgs, parseJobs, runPool, spawnSuite } from './run-mutations.mjs'
import { runNode } from './spawn.testkit.mjs'

// Absolute path to the harness itself — needed so a subprocess invoked with a DIFFERENT cwd can
// still find the script. `import.meta.url` is always this file's own URL regardless of cwd.
const HARNESS = fileURLToPath(new URL('./run-mutations.mjs', import.meta.url))

const testEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@test',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@test',
}

// Strip NODE_TEST_CONTEXT so the harness's own `node --test` spawns are not seen as recursive by
// the host test runner — same reason `run-mutations.spawn.test.mjs` does this.
const { NODE_TEST_CONTEXT: _ntc, ...envWithoutTestContext } = process.env

const gitRunner = (dir) => (args) => {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: testEnv })
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`)
  return r
}

const fixedGreenSuite = (title) =>
  `process.stdout.write('TAP version 13\\n1..1\\nok 1 - ${title}\\n')\n`

const fixtureDirs = []
after(() => {
  for (const dir of fixtureDirs) rmSync(dir, { recursive: true, force: true })
})

/** A throwaway repo with git identity configured. Returns its path and a git runner bound to it. */
function newRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  fixtureDirs.push(dir)
  const g = gitRunner(dir)
  g(['init', '-q', '.'])
  g(['config', 'user.email', 'test@test'])
  g(['config', 'user.name', 'test'])
  return { dir, g }
}

/** Write `.claude/hooks/<base>.mutations.json` with one mutation whose expectRed never fires. */
function writeGuard(dir, base, target) {
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true })
  const letter = target.replace(/\.mjs$/, '')
  writeFileSync(
    join(dir, '.claude', 'hooks', `${base}.mutations.json`),
    JSON.stringify({
      target,
      suites: [`${letter}.test.mjs`],
      mutations: [
        {
          id: `touch-${letter}`,
          find: `export const ${letter} = 1`,
          replace: `export const ${letter} = 2`,
          expectRed: ['a-test-that-never-fires'],
        },
      ],
    }),
  )
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// parseJobs
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// MUTATION: change `!Number.isInteger(n) || n < 1` to `n < 1` in parseJobs → a non-integer value
// like '2.5' passes validation instead of being refused with a clear arg error.
// GROUP: parsejobs-rejects-non-integer
test('parseJobs rejects a non-integer value', () => {
  assert.match(parseJobs('2.5').error, /--jobs must be a positive integer/)
  assert.match(parseJobs('2.5').error, /2\.5/)
})

// MUTATION: change `n < 1` to `n < 0` in parseJobs → --jobs 0 is accepted, so `runPool`'s
// `Math.min(jobs, tasks.length)` runs zero workers — every task queued, none ever run, and the
// batch silently reports 0 mutations graded instead of refusing the flag.
// GROUP: parsejobs-rejects-zero-and-negative
test('parseJobs rejects zero and negative values', () => {
  assert.match(parseJobs('0').error, /positive integer/)
  assert.match(parseJobs('-1').error, /positive integer/)
})

// MUTATION: change `Number(value)` to `Number(value) || 1` in parseJobs → a non-numeric value
// (`Number('abc')` is NaN) coerces to the default 1 instead of being refused.
// GROUP: parsejobs-rejects-nan
test('parseJobs rejects a non-numeric value', () => {
  assert.match(parseJobs('abc').error, /positive integer/)
})

// MUTATION: change `return { jobs: n }` to `return { jobs: 1 }` in parseJobs → every valid value
// is silently discarded and replaced with the default, so `--jobs 4` never actually parallelises.
// GROUP: parsejobs-accepts-positive-integer
test('parseJobs accepts a positive integer and returns it as a number', () => {
  assert.deepEqual(parseJobs('1'), { jobs: 1 })
  assert.deepEqual(parseJobs('4'), { jobs: 4 })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// runPool — ordering and concurrency bound
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// MUTATION: change `results[i] = await tasks[i]()` to `results.push(await tasks[i]())` in
// runPool's worker → out-of-order completion writes results in COMPLETION order, not INPUT
// order — exactly the guarantee R2 (byte-identical output for any --jobs) rests on.
// GROUP: runpool-preserves-input-order
test('runPool returns results in input order even when they complete out of order', async () => {
  const completionOrder = []
  const delaysMs = [30, 10, 20, 0]
  const tasks = delaysMs.map((ms, i) => async () => {
    await new Promise((r) => setTimeout(r, ms))
    completionOrder.push(i)
    return i
  })
  const results = await runPool(tasks, 4)
  assert.deepEqual(results, [0, 1, 2, 3])
  // Completion order differs from input order — proves this run wasn't accidentally serial.
  assert.notDeepEqual(completionOrder, [0, 1, 2, 3])
})

// MUTATION: change `Math.min(jobs, tasks.length)` to `tasks.length` in runPool → every task
// starts a worker immediately regardless of `jobs`, so the in-flight bound is never honoured.
// GROUP: runpool-bounds-in-flight
test('runPool never runs more than `jobs` tasks at once', async () => {
  let inFlight = 0
  let maxInFlight = 0
  const tasks = Array.from({ length: 6 }, () => async () => {
    inFlight++
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((r) => setTimeout(r, 10))
    inFlight--
    return null
  })
  await runPool(tasks, 2)
  assert.equal(maxInFlight, 2)
})

test('runPool with jobs=1 runs strictly serially', async () => {
  let inFlight = 0
  let maxInFlight = 0
  const tasks = Array.from({ length: 4 }, () => async () => {
    inFlight++
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((r) => setTimeout(r, 5))
    inFlight--
    return null
  })
  await runPool(tasks, 1)
  assert.equal(maxInFlight, 1)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// spawnSuite — the spawnSync-shaped async replacement
// ─────────────────────────────────────────────────────────────────────────────────────────────────

test('spawnSuite resolves a normal exit with the spawnSync-shaped result', async () => {
  const r = await spawnSuite(['-e', 'process.exit(0)'], { timeout: 5000, maxBuffer: 1024 * 1024 })
  assert.equal(r.status, 0)
  assert.equal(r.signal, null)
  assert.equal(r.error, null)
})

test('spawnSuite resolves a non-zero exit without treating it as a spawn error', async () => {
  const r = await spawnSuite(['-e', 'process.exit(3)'], { timeout: 5000, maxBuffer: 1024 * 1024 })
  assert.equal(r.status, 3)
  assert.equal(r.error, null)
})

// MUTATION: change `error.code = 'ETIMEDOUT'` in spawnSuite's timeout branch to `'ETIMEOUT'` →
// `assertSpawnUsable`'s `r.error.code === 'ETIMEDOUT'` check no longer matches, so a genuine
// timeout falls through to the generic "could not spawn node" branch instead of naming itself.
// (Dropping the `child.kill(killSignal)` call itself is NOT encoded: without it the fixture's
// hanging child is never killed, so grading it would hang for the full SUITE_TIMEOUT_MS and the
// mutation would always FAULT, never CAUGHT — the same reason the import-cycle test in `run-mutations.scope.test.mjs` is a
// smoke test rather than a data-file entry.)
// GROUP: spawnsuite-timeout-sets-etimedout
test('spawnSuite kills a hanging child and reports ETIMEDOUT, matching spawnSync', async () => {
  const r = await spawnSuite(['-e', 'setInterval(() => {}, 1000)'], {
    timeout: 200,
    maxBuffer: 1024 * 1024,
  })
  assert.equal(r.error.code, 'ETIMEDOUT')
  assert.ok(r.signal, 'expected a kill signal to be recorded')
})

// MUTATION: delete the `if (out.bytes > maxBuffer) onOverflow()` check in spawnSuite's output
// collector → output past `maxBuffer` is buffered without limit instead of the child being
// killed — the unbounded growth `spawnSync`'s own `maxBuffer` option exists to bound.
// GROUP: spawnsuite-enforces-maxbuffer
test('spawnSuite kills a child whose output exceeds maxBuffer and reports ENOBUFS', async () => {
  const r = await spawnSuite(
    ['-e', "setInterval(() => process.stdout.write('x'.repeat(1024)), 1)"],
    { timeout: 5000, maxBuffer: 4096 },
  )
  assert.equal(r.error.code, 'ENOBUFS')
})

// MUTATION: delete the `setEncoding('utf8')` call in spawnSuite's output collector → each raw
// chunk is decoded alone, so a `€` split across two writes arrives as replacement characters.
// GROUP: spawnsuite-decodes-utf8
test('spawnSuite decodes a multi-byte character split across two output chunks', async () => {
  const child = [
    "const b = Buffer.from('€')",
    'process.stdout.write(b.subarray(0, 2))',
    'setTimeout(() => process.stdout.write(b.subarray(2)), 50)',
  ].join(';')
  const r = await spawnSuite(['-e', child], { timeout: 5000, maxBuffer: 1024 * 1024 })
  assert.equal(r.stdout, '€')
})

// Smoke test, no MUTATION claim: confirms a genuine spawn-time error (an unusable cwd) surfaces
// as `error` with neither ETIMEDOUT nor ENOBUFS, matching spawnSync's own three-way shape. The
// mechanism is already pinned by `assertSpawnUsable`'s own suite (`run-mutations.spawn.test.mjs`).
test('spawnSuite reports a spawn error distinctly from a timeout or a buffer overflow', async () => {
  const r = await spawnSuite(['-e', '1'], {
    cwd: '/no/such/directory/for/spawnsuite-cwd-test',
    timeout: 1000,
    maxBuffer: 1024 * 1024,
  })
  assert.ok(r.error, 'expected an error on the result')
  assert.notEqual(r.error.code, 'ETIMEDOUT')
  assert.notEqual(r.error.code, 'ENOBUFS')
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// End to end: --jobs 1 vs --jobs 3 — R2, byte-identical output and exit code
//
// Fixture: one target function with four independent branches, one mutation per branch. Each
// mutation reddens exactly one test, so all four are CAUGHT regardless of run order — the run
// exits 0 either way, and R2 says the printed report must be identical either way too.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

function buildJobsE2eRepo() {
  const { dir, g } = newRepo('rm-jobs-e2e-')
  writeFileSync(
    join(dir, 'target.mjs'),
    [
      'export function f(n) {',
      "  if (n === 1) return 'one'",
      "  if (n === 2) return 'two'",
      "  if (n === 3) return 'three'",
      "  return 'other'",
      '}',
      '',
    ].join('\n'),
  )
  writeFileSync(
    join(dir, 'target.test.mjs'),
    [
      "import assert from 'node:assert/strict'",
      "import test from 'node:test'",
      "import { f } from './target.mjs'",
      "test('one', () => { assert.equal(f(1), 'one') })",
      "test('two', () => { assert.equal(f(2), 'two') })",
      "test('three', () => { assert.equal(f(3), 'three') })",
      "test('other', () => { assert.equal(f(4), 'other') })",
      '',
    ].join('\n'),
  )
  g(['add', '-A'])
  g(['commit', '-q', '-m', 'init'])
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true })
  writeFileSync(
    join(dir, '.claude', 'hooks', 'jobs-e2e.mutations.json'),
    JSON.stringify({
      target: 'target.mjs',
      suites: ['target.test.mjs'],
      mutations: [
        { id: 'm-one', find: "return 'one'", replace: "return 'ONE'", expectRed: ['one'] },
        { id: 'm-two', find: "return 'two'", replace: "return 'TWO'", expectRed: ['two'] },
        { id: 'm-three', find: "return 'three'", replace: "return 'THREE'", expectRed: ['three'] },
        { id: 'm-other', find: "return 'other'", replace: "return 'OTHER'", expectRed: ['other'] },
      ],
    }),
  )
  return dir
}

test('grading with --jobs 1 and --jobs 3 produces byte-identical output and the same exit code', () => {
  const dir = buildJobsE2eRepo()
  const run1 = runNode('harness --jobs 1', [HARNESS, '--guard', 'jobs-e2e', '--jobs', '1'], {
    cwd: dir,
    env: envWithoutTestContext,
  })
  const run3 = runNode('harness --jobs 3', [HARNESS, '--guard', 'jobs-e2e', '--jobs', '3'], {
    cwd: dir,
    env: envWithoutTestContext,
  })
  assert.equal(run1.status, 0, `stdout:\n${run1.stdout}\nstderr:\n${run1.stderr}`)
  assert.equal(run1.status, run3.status)
  assert.equal(run1.stdout, run3.stdout, `--jobs 1:\n${run1.stdout}\n--jobs 3:\n${run3.stdout}`)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// R6: a --staged run still selects a data file deleted from the WORKING TREE but unchanged in
// the index — the candidate list is ref-enumerated (`git ls-tree`), never `readdirSync`.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

function buildDiskDeletedRepo() {
  const { dir, g } = newRepo('rm-jobs-staged-disk-del-')
  g(['commit', '-q', '--allow-empty', '-m', 'init'])
  writeFileSync(join(dir, 'd.mjs'), 'export const d = 1\n')
  writeFileSync(join(dir, 'd.test.mjs'), fixedGreenSuite('d-ok'))
  writeGuard(dir, 'disk-deleted', 'd.mjs')
  g(['add', '-A'])
  g(['commit', '-q', '-m', 'commit guard'])
  // Delete the data file from the WORKING TREE only — never staged, so the index (and the
  // synthetic index commit `--staged` grades) still carries it unchanged.
  unlinkSync(join(dir, '.claude', 'hooks', 'disk-deleted.mutations.json'))
  // Stage an unrelated change to the target so the guard is IN SCOPE.
  writeFileSync(join(dir, 'd.mjs'), 'export const d = 1\nexport const d2 = 2\n')
  g(['add', 'd.mjs'])
  return dir
}

// Smoke test, no MUTATION claim: a disk-based `readdirSync` enumeration would MISS this file, but
// encoding "swap dataFilesAt for the disk-based dataFiles" as a text-anchor mutation would change
// a whole function call rather than pin one mechanism — the ref-vs-disk distinction is already
// covered structurally by every other `--staged` test reading through `dataFilesAt`.
test('a --staged run still selects a data file deleted from the working tree but present in the index', () => {
  const dir = buildDiskDeletedRepo()
  const run = runNode(
    'harness --staged --guard disk-deleted, data file deleted on disk',
    [HARNESS, '--staged', '--guard', 'disk-deleted'],
    { cwd: dir, env: envWithoutTestContext },
  )
  assert.equal(run.status, 1, `stdout:\n${run.stdout}\nstderr:\n${run.stderr}`)
  assert.match(run.stdout, /touch-d/, run.stdout)
  assert.match(run.stdout, /SURVIVED/, run.stdout)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// R7: indexCommit's commit-tree needs no inherited git identity
// ─────────────────────────────────────────────────────────────────────────────────────────────────

function buildNoIdentityRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'rm-jobs-noident-'))
  fixtureDirs.push(dir)
  const homeDir = mkdtempSync(join(tmpdir(), 'rm-jobs-noident-home-'))
  fixtureDirs.push(homeDir)
  // HOME/XDG_CONFIG_HOME point at an EMPTY directory and GIT_CONFIG_NOSYSTEM blocks the system
  // config too, so no `[user]` section is reachable from anywhere — the repo's git identity is
  // genuinely empty, the exact case indexCommit's inline `-c` flags exist to survive.
  const sandbox = { HOME: homeDir, XDG_CONFIG_HOME: homeDir, GIT_CONFIG_NOSYSTEM: '1' }
  const setupEnv = {
    ...envWithoutTestContext,
    ...sandbox,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@test',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@test',
  }
  const g = (args) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: setupEnv })
    assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`)
    return r
  }
  g(['init', '-q', '.'])
  g(['commit', '-q', '--allow-empty', '-m', 'init'])
  writeFileSync(join(dir, 'e.mjs'), 'export const e = 1\n')
  writeFileSync(join(dir, 'e.test.mjs'), fixedGreenSuite('e-ok'))
  writeGuard(dir, 'no-identity', 'e.mjs')
  g(['add', '-A'])
  // The RUN env: same sandbox (no `[user]` reachable anywhere), but NO identity env vars — this
  // is what `--staged` sees when indexCommit's own `-c` flags are the ONLY identity available.
  const runEnv = { ...envWithoutTestContext, ...sandbox }
  return { dir, runEnv }
}

// MUTATION: delete the `'-c', 'user.name=mutation-harness', '-c', 'user.email=...'` flags from
// indexCommit's `commit-tree` call → a repo with no configured git identity anywhere (no repo,
// global or system config) can no longer make the synthetic index commit `--staged` needs, and
// every `--staged` run in that environment faults with "unable to auto-detect" instead of grading.
// GROUP: indexcommit-explicit-identity
test('indexCommit succeeds with no git identity configured anywhere', () => {
  const { dir, runEnv } = buildNoIdentityRepo()
  const run = runNode(
    'harness --staged --guard no-identity, no git identity configured',
    [HARNESS, '--staged', '--guard', 'no-identity'],
    { cwd: dir, env: runEnv },
  )
  const out = `${run.stdout}${run.stderr}`
  assert.doesNotMatch(out, /unable to auto-detect/, out)
  assert.doesNotMatch(out, /Please tell me who you are/, out)
  assert.match(out, /touch-e/, out)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// parseArgs -- --jobs integration: happy path and conflict detection
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// MUTATION: change `jobs: jobsResult.jobs` to `jobs: 1` in parseArgs's return → every
// valid --jobs value is silently discarded and the caller always gets 1.
// GROUP: parseargs-reads-jobs-value
test('parseArgs propagates --jobs N to the jobs field in the result', () => {
  const result = parseArgs(['--jobs', '4'])
  assert.equal(result.error, undefined)
  assert.equal(result.jobs, 4)
})

// MUTATION: replace the `parseJobs(opts.jobs ?? '1')` call and its error return in parseArgs with
// `{ jobs: 1 }` → a bad --jobs value like 'abc' passes through without an error.
// GROUP: parseargs-propagates-jobs-error
test('parseArgs returns an error when --jobs has an invalid value', () => {
  assert.match(parseArgs(['--jobs', 'abc']).error, /--jobs must be a positive integer/)
  assert.match(parseArgs(['--jobs', '0']).error, /--jobs must be a positive integer/)
})

// MUTATION: delete the `modes.includes('--list')` sub-condition from the modeConflict jobs check
// → `--jobs` together with `--list` is accepted and the jobs value is silently ignored.
// GROUP: jobs-conflicts-with-list
test('parseArgs rejects --jobs combined with --list', () => {
  assert.match(parseArgs(['--jobs', '2', '--list']).error, /--jobs only applies to a grading run/)
})

// MUTATION: delete the `modes.includes('--coverage')` sub-condition from the modeConflict jobs
// check → `--jobs` together with `--coverage` is accepted and the jobs value is silently ignored.
// GROUP: jobs-conflicts-with-coverage
test('parseArgs rejects --jobs combined with --coverage', () => {
  assert.match(
    parseArgs(['--jobs', '2', '--coverage']).error,
    /--jobs only applies to a grading run/,
  )
})
