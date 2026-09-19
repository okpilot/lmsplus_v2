// Run: node --test .claude/hooks/run-mutations.write.test.mjs
//
// `--update-expected` end to end: the only mode that writes to a tracked data file.
//
// A SIBLING file, not a section of `run-mutations.spawn.test.mjs`: that suite is near its cap in
// `.claude/limits.json`. Both are listed in `run-mutations.mutations.json`, so a break in either
// is graded by the harness itself.
//
// Every case spawns the harness with a temp git repo as cwd. `repoRoot()` is a zero-parameter
// closure over `git rev-parse --show-toplevel` with no explicit cwd, so it inherits the process
// cwd and the whole execution routes through the fixture's data file, never production code.
//
// Where a test asserts that the file did NOT change, or changed in exactly one place, it compares
// the bytes rather than a parsed field: the write is text surgery, and a parsed assertion would
// pass on a rewrite that reformatted every other line.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { assertUsable, runNode } from './spawn.testkit.mjs'

const HARNESS = fileURLToPath(new URL('./run-mutations.mjs', import.meta.url))

const gitRunner = (dir, env) => (args) => {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env })
  assertUsable(`git ${args.join(' ')} in ${dir}`, r)
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`)
  return r
}

/**
 * Temp git repo with a committed target + suite and an uncommitted data file.
 *
 * `redNames` are the test names the suite reddens once the target is MUTATED; clean, they all
 * pass. Real `node:test` tests, not the raw-TAP shape `run-mutations.spawn.test.mjs` uses: a test
 * file's own TAP is comment-prefixed by the parent runner, so raw TAP can only ever report the
 * FILE as green. The nested-runner hazard that shape avoids is handled here by stripping
 * NODE_TEST_CONTEXT from the harness's environment instead (`noTestContext`).
 */
function buildFixtureRepo(mutations, redNames = ['alpha goes red'], opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rm-write-fixture-'))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@test',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@test',
  }
  const g = gitRunner(dir, env)
  writeFileSync(join(dir, 'target.mjs'), 'export const x = 1\n')
  writeFileSync(
    join(dir, 'suite.test.mjs'),
    [
      "import assert from 'node:assert/strict'",
      "import test from 'node:test'",
      "import { x } from './target.mjs'",
      `for (const name of ${JSON.stringify(redNames)}) test(name, () => assert.equal(x, 1))`,
      '',
    ].join('\n'),
  )
  g(['init'])
  g(['config', 'user.email', 'test@test'])
  g(['config', 'user.name', 'test'])
  g(['add', 'target.mjs', 'suite.test.mjs'])
  g(['commit', '-m', 'init'])
  const suites = ['suite.test.mjs']
  if (opts.untrackedSuite) {
    // Declared, on disk, never committed — and the repo is configured to HIDE untracked files,
    // which is what makes this non-vacuous: without `--untracked-files=all` the gate sees a
    // clean tree and grades a HEAD that does not contain this suite.
    writeFileSync(
      join(dir, 'extra.test.mjs'),
      "import test from 'node:test'\ntest('extra', () => {})\n",
    )
    g(['config', 'status.showUntrackedFiles', 'no'])
    suites.push('extra.test.mjs')
  }

  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true })
  const dataPath = join(dir, '.claude', 'hooks', 'fixture.mutations.json')
  writeFileSync(
    dataPath,
    `${JSON.stringify({ target: 'target.mjs', suites, mutations }, null, 2)}\n`,
  )
  return { dir, dataPath, env }
}

const MISMATCH_MUT = [
  {
    id: 'alpha',
    find: 'export const x = 1',
    replace: 'export const x = 2',
    expectRed: ['a name the suite never emits'],
  },
]

/** A mutation the suite cannot see: the text changes, the exported value does not, so nothing reddens. */
const SURVIVOR_MUT = [
  {
    id: 'valid-survivor',
    find: 'export const x = 1',
    replace: 'export const x = 0 + 1',
    expectRed: ['alpha goes red'],
  },
]

const noTestContext = () => {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  return env
}

test('--update-expected rewrites a MISMATCH from the set actually observed', () => {
  const { dir, dataPath } = buildFixtureRepo(MISMATCH_MUT)
  const before = readFileSync(dataPath, 'utf8')
  const r = runNode('update-expected on a mismatch', [HARNESS, '--update-expected'], {
    cwd: dir,
    env: noTestContext(),
  })
  assert.equal(r.status, 0, r.stderr)
  const after = readFileSync(dataPath, 'utf8')
  assert.notEqual(after, before)
  assert.deepEqual(JSON.parse(after).mutations[0].expectRed, ['alpha goes red'])
  // Everything but the one array is untouched — the whole point of editing as text. The fixture
  // is built by `JSON.stringify(…, 2)`, which always breaks an array across lines; the writer
  // re-renders it on one because it fits the 100-column budget, so the expectation carries that.
  assert.equal(
    after,
    before.replace('[\n        "a name the suite never emits"\n      ]', '["alpha goes red"]'),
  )
})

test('--update-expected writes nothing for a SURVIVED entry and says why', () => {
  const { dir, dataPath } = buildFixtureRepo(SURVIVOR_MUT)
  const before = readFileSync(dataPath, 'utf8')
  const r = runNode('update-expected on a survivor', [HARNESS, '--update-expected'], {
    cwd: dir,
    env: noTestContext(),
  })
  assert.equal(r.status, 1, r.stderr)
  assert.equal(readFileSync(dataPath, 'utf8'), before)
  assert.match(r.stderr, /SURVIVED/)
  assert.match(r.stderr, /fix\s+the MUTATION, not the expectation/s)
})

test('a normal run never writes to the data file', () => {
  // The constraint the whole mode is gated on: the write must be reachable ONLY through the flag.
  const { dir, dataPath } = buildFixtureRepo(MISMATCH_MUT)
  const before = readFileSync(dataPath, 'utf8')
  const r = runNode('plain run on a mismatch', [HARNESS], { cwd: dir, env: noTestContext() })
  assert.equal(r.status, 1, r.stderr)
  assert.equal(readFileSync(dataPath, 'utf8'), before)
})

test('a name the suite reddened twice is written once', () => {
  const { dir, dataPath } = buildFixtureRepo(MISMATCH_MUT, ['alpha goes red', 'alpha goes red'])
  const r = runNode('update-expected with a repeated name', [HARNESS, '--update-expected'], {
    cwd: dir,
    env: noTestContext(),
  })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(JSON.parse(readFileSync(dataPath, 'utf8')).mutations[0].expectRed, [
    'alpha goes red',
  ])
})

test('--update-expected refuses to grade when a declared suite is uncommitted', () => {
  // The grading run reads HEAD, so an uncommitted suite is not what gets graded: the set written
  // would be the OLD one, silently.
  const { dir, dataPath } = buildFixtureRepo(MISMATCH_MUT)
  const before = readFileSync(dataPath, 'utf8')
  writeFileSync(join(dir, 'suite.test.mjs'), '// edited, not committed\n')
  const r = runNode('update-expected on a dirty tree', [HARNESS, '--update-expected'], {
    cwd: dir,
    env: noTestContext(),
  })
  assert.equal(r.status, 2, r.stderr)
  assert.equal(readFileSync(dataPath, 'utf8'), before)
  assert.match(r.stderr, /uncommitted input/)
  assert.match(r.stderr, /suite\.test\.mjs/)
})

test('--update-expected refuses a staged but not yet committed change', () => {
  // `git status --porcelain` reports staged changes just as it reports unstaged
  // ones — both are uncommitted inputs the grader cannot see.
  const { dir, dataPath, env } = buildFixtureRepo(MISMATCH_MUT)
  const before = readFileSync(dataPath, 'utf8')
  const g = gitRunner(dir, env)
  writeFileSync(join(dir, 'suite.test.mjs'), '// staged, not committed\n')
  g(['add', 'suite.test.mjs'])
  const r = runNode('update-expected on a staged change', [HARNESS, '--update-expected'], {
    cwd: dir,
    env: noTestContext(),
  })
  assert.equal(r.status, 2, r.stderr)
  assert.equal(readFileSync(dataPath, 'utf8'), before)
  assert.match(r.stderr, /uncommitted input/)
  assert.match(r.stderr, /suite\.test\.mjs/)
})

test('a batch that holds a fault exits 2 even when another entry mismatches', () => {
  // MUTATION: swap the `runExit === 2` check so mismatch rewrites are attempted
  // before the fault guard fires -> the data file is modified on a run that
  // produced no trustworthy verdict, laundering a stale expectation.
  //
  // `modeRun` returns 2 when any mutation faults; `modeUpdateExpected` must
  // check that exit before writing anything. A fault means `onResult` was never
  // called for that mutation, so its observed set is never in the graded map.
  const { dir, dataPath } = buildFixtureRepo([
    {
      id: 'faults-out',
      find: 'NO_SUCH_STRING_IN_TARGET',
      replace: 'x',
      expectRed: ['alpha goes red'],
    },
    {
      id: 'mismatches',
      find: 'export const x = 1',
      replace: 'export const x = 2',
      expectRed: ['a name the suite never emits'],
    },
  ])
  const before = readFileSync(dataPath, 'utf8')
  const r = runNode('fault + mismatch batch', [HARNESS, '--update-expected'], {
    cwd: dir,
    env: noTestContext(),
  })
  assert.equal(r.status, 2, r.stderr)
  assert.equal(readFileSync(dataPath, 'utf8'), before)
  assert.match(r.stderr, /NO VERDICT/)
})

/**
 * A SECOND data file in the same repo, with its own target and suite.
 *
 * `validateDataFile` rejects a duplicate id within ONE file and says nothing across files, so an
 * id shared by two data files is legal — and nine are shared in this repo's own corpus today.
 */
function addDataFile(dir, basename, { redName, mutations }) {
  const stem = basename.replace(/\W/g, '')
  writeFileSync(join(dir, `${stem}.mjs`), 'export const y = 1\n')
  writeFileSync(
    join(dir, `${stem}.test.mjs`),
    [
      "import assert from 'node:assert/strict'",
      "import test from 'node:test'",
      `import { y } from './${stem}.mjs'`,
      `test(${JSON.stringify(redName)}, () => assert.equal(y, 1))`,
      '',
    ].join('\n'),
  )
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@test',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@test',
  }
  const g = gitRunner(dir, env)
  g(['add', `${stem}.mjs`, `${stem}.test.mjs`])
  g(['commit', '-m', basename])
  const dataPath = join(dir, '.claude', 'hooks', `${basename}${'.mutations.json'}`)
  writeFileSync(
    dataPath,
    `${JSON.stringify({ target: `${stem}.mjs`, suites: [`${stem}.test.mjs`], mutations }, null, 2)}\n`,
  )
  return dataPath
}

test('two data files sharing a mutation id each get their own observed set', () => {
  // The SAME id in both files, and a break each file's own suite actually reddens.
  const shared = [{ id: 'shared-id', find: '= 1', replace: '= 2', expectRed: ['neither suite'] }]
  const { dir, dataPath } = buildFixtureRepo(shared, ['alpha goes red'])
  const otherPath = addDataFile(dir, 'other', { redName: 'beta goes red', mutations: shared })
  const r = runNode('two data files, one id', [HARNESS, '--update-expected'], {
    cwd: dir,
    env: noTestContext(),
  })
  assert.equal(r.status, 0, r.stderr)
  // Keyed on the id alone, whichever file is graded last wins BOTH entries.
  assert.deepEqual(JSON.parse(readFileSync(dataPath, 'utf8')).mutations[0].expectRed, [
    'alpha goes red',
  ])
  assert.deepEqual(JSON.parse(readFileSync(otherPath, 'utf8')).mutations[0].expectRed, [
    'beta goes red',
  ])
})

test('--update-expected refuses a declared suite that was never committed', () => {
  const { dir, dataPath } = buildFixtureRepo(MISMATCH_MUT, ['alpha goes red'], {
    untrackedSuite: true,
  })
  const before = readFileSync(dataPath, 'utf8')
  const r = runNode('untracked suite', [HARNESS, '--update-expected'], {
    cwd: dir,
    env: noTestContext(),
  })
  assert.equal(r.status, 2, r.stderr)
  assert.equal(readFileSync(dataPath, 'utf8'), before)
  assert.match(r.stderr, /uncommitted input/)
  assert.match(r.stderr, /extra\.test\.mjs/)
})
