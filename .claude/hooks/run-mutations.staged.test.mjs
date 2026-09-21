// Run: node --test .claude/hooks/run-mutations.staged.test.mjs
//
// Coverage for `--staged`: grades the INDEX rather than HEAD, scoped to the data files whose
// target/suites/own path actually touch what is staged. A SIBLING file, not a section of
// `run-mutations.test.mjs`: that suite sits at its cap in `.claude/limits.json`
// (`--stats` before adding a line here). Listed in `run-mutations.mutations.json`, so a break in
// this file's own logic is graded by the harness itself, same as every other suite there.
//
// `touchesStaged`'s scope predicate is pinned directly, with a controllable fake — no real git.
// The REF and end-to-end SCOPE mechanisms need a real repo and the real CLI, since `indexCommit`
// and `modeRun`'s file selection are not exported; those tests build a throwaway git repo and
// spawn the harness itself, the same pattern `run-mutations.spawn.test.mjs` and
// `run-mutations.write.test.mjs` use.
//
// Every case with a `// MUTATION:` comment is pinned by a `// GROUP:` marker into
// `run-mutations.mutations.json`; a few smoke tests carry neither and claim no coverage.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseArgs, relPath, touchesStaged } from './run-mutations.mjs'
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

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// touchesStaged — the scope predicate
// ─────────────────────────────────────────────────────────────────────────────────────────────────

test('touchesStaged matches on the data file itself, its target, or a suite', () => {
  const root = '/repo'
  const file = { path: '/repo/.claude/hooks/x.mutations.json' }
  const data = {
    target: '.claude/hooks/x.mjs',
    suites: ['.claude/hooks/x.test.mjs'],
    mutations: [],
  }
  assert.equal(touchesStaged(root, file, data, new Set(['.claude/hooks/x.mjs'])), true)
  assert.equal(touchesStaged(root, file, data, new Set(['.claude/hooks/x.test.mjs'])), true)
  assert.equal(touchesStaged(root, file, data, new Set(['.claude/hooks/x.mutations.json'])), true)
  assert.equal(touchesStaged(root, file, data, new Set(['.claude/hooks/unrelated.mjs'])), false)
})

test('relPath renders an absolute path under root as root-relative POSIX', () => {
  assert.equal(relPath('/repo', '/repo/.claude/hooks/x.mjs'), '.claude/hooks/x.mjs')
  assert.equal(relPath('/repo', '.claude/hooks/x.mjs'), '.claude/hooks/x.mjs')
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// parseArgs — --staged
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// MUTATION: delete the `opts.staged && modes.length > 0` guard in `parseArgs` → `--staged
// --coverage` silently proceeds into coverage mode instead of refusing an unsupported combination
// the rest of the harness was never built to grade.
// GROUP: staged-rejects-other-modes
test('rejects --staged combined with a mode flag', () => {
  assert.match(parseArgs(['--staged', '--coverage']).error, /--staged only applies to a plain run/)
  assert.match(parseArgs(['--list', '--staged']).error, /--staged only applies to a plain run/)
})

test('accepts --staged alone, with no mode flag', () => {
  const parsed = parseArgs(['--staged'])
  assert.equal(parsed.error, undefined)
  assert.equal(parsed.staged, true)
  assert.equal(parsed.mode, 'run')
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// --staged end to end: the INDEX ref
//
// Fixture: target + suite are `git add`-ed but never committed — only an empty initial commit
// exists at HEAD. A worktree built from HEAD cannot see either file; the index commit can.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

function buildStagedOnlyRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'rm-staged-idx-'))
  const g = gitRunner(dir)
  g(['init', '-q', '.'])
  g(['config', 'user.email', 'test@test'])
  g(['config', 'user.name', 'test'])
  g(['commit', '-q', '--allow-empty', '-m', 'init'])
  writeFileSync(join(dir, 'target.mjs'), 'export const x = 1\n')
  writeFileSync(join(dir, 'suite.test.mjs'), fixedGreenSuite('placeholder'))
  g(['add', 'target.mjs', 'suite.test.mjs'])
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true })
  writeFileSync(
    join(dir, '.claude', 'hooks', 'idx-fixture.mutations.json'),
    JSON.stringify({
      target: 'target.mjs',
      suites: ['suite.test.mjs'],
      mutations: [
        {
          id: 'stage-only-target',
          find: 'export const x = 1',
          replace: 'export const x = 2',
          expectRed: ['a-test-that-never-fires'],
        },
      ],
    }),
  )
  // The data file itself is staged too — a real "add a new guard" commit stages the guard, its
  // suite AND its data file together. loadDataFileAt reads this file's content from the INDEX,
  // so it must actually be in the index for the run below to find it there.
  g(['add', '.claude/hooks/idx-fixture.mutations.json'])
  return dir
}

const stagedIdxDir = buildStagedOnlyRepo()
const stagedIdxRun = runNode(
  'harness --staged --guard idx-fixture on a stage-only fixture',
  [HARNESS, '--staged', '--guard', 'idx-fixture'],
  { cwd: stagedIdxDir, env: envWithoutTestContext },
)

// MUTATION: replace the `ref` argument to `git worktree add --detach wt ref` in `runMutation` with
// the literal `'HEAD'` → the worktree always checks out HEAD regardless of `--staged`, `target.mjs`
// does not exist there (it is only staged), and the mutation FAULTS with "cannot read target"
// instead of grading a real verdict against what is staged.
// GROUP: staged-run-grades-the-index
test('a --staged run grades a file that is only staged, not committed', () => {
  assert.doesNotMatch(
    `${stagedIdxRun.stdout}${stagedIdxRun.stderr}`,
    /cannot read target/,
    `stdout:\n${stagedIdxRun.stdout}\nstderr:\n${stagedIdxRun.stderr}`,
  )
  assert.match(stagedIdxRun.stdout, /stage-only-target/, `stdout:\n${stagedIdxRun.stdout}`)
  assert.match(stagedIdxRun.stdout, /SURVIVED/, `stdout:\n${stagedIdxRun.stdout}`)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// --staged end to end: scope
//
// Fixture: two committed guards, `scope-a` (target a.mjs) and `scope-b` (target b.mjs). Only
// a.mjs is staged afterward. A `--staged` run with no `--guard` must grade scope-a and skip scope-b.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

function buildStagedScopeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'rm-staged-scope-'))
  const g = gitRunner(dir)
  g(['init', '-q', '.'])
  g(['config', 'user.email', 'test@test'])
  g(['config', 'user.name', 'test'])
  writeFileSync(join(dir, 'a.mjs'), 'export const a = 1\n')
  writeFileSync(join(dir, 'a.test.mjs'), fixedGreenSuite('a-ok'))
  writeFileSync(join(dir, 'b.mjs'), 'export const b = 1\n')
  writeFileSync(join(dir, 'b.test.mjs'), fixedGreenSuite('b-ok'))
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true })
  writeFileSync(
    join(dir, '.claude', 'hooks', 'scope-a.mutations.json'),
    JSON.stringify({
      target: 'a.mjs',
      suites: ['a.test.mjs'],
      mutations: [
        {
          id: 'touch-a',
          find: 'export const a = 1',
          replace: 'export const a = 2',
          expectRed: ['a-test-that-never-fires'],
        },
      ],
    }),
  )
  writeFileSync(
    join(dir, '.claude', 'hooks', 'scope-b.mutations.json'),
    JSON.stringify({
      target: 'b.mjs',
      suites: ['b.test.mjs'],
      mutations: [
        {
          id: 'touch-b',
          find: 'export const b = 1',
          replace: 'export const b = 2',
          expectRed: ['a-test-that-never-fires'],
        },
      ],
    }),
  )
  // Both guards, TRACKED, committed at HEAD — same as any pre-existing guard the branch doesn't
  // touch. loadDataFileAt reads a data file's content from the INDEX, which mirrors HEAD for any
  // file this commit leaves alone, so an untouched guard's data file is still gradable.
  g([
    'add',
    'a.mjs',
    'a.test.mjs',
    'b.mjs',
    'b.test.mjs',
    '.claude/hooks/scope-a.mutations.json',
    '.claude/hooks/scope-b.mutations.json',
  ])
  g(['commit', '-q', '-m', 'init'])
  // Stage a change to a.mjs only — b.mjs is untouched, so it must stay out of scope.
  writeFileSync(join(dir, 'a.mjs'), 'export const a = 1\nexport const a2 = 2\n')
  g(['add', 'a.mjs'])
  return dir
}

const stagedScopeDir = buildStagedScopeRepo()
const stagedScopeRun = runNode(
  'harness --staged with no --guard, two guards on disk',
  [HARNESS, '--staged'],
  {
    cwd: stagedScopeDir,
    env: envWithoutTestContext,
  },
)

// MUTATION: change `touchesStaged`'s `return paths.some(...)` to `return true` → every data file
// is "in scope" no matter what is staged, and a `--staged` run silently widens back to a full run.
// MUTATION: invert `filterByStagedScope`'s filter predicate (`touchesStaged` → `!touchesStaged`) →
// scope-a (which DOES touch staged) is excluded and scope-b (which does NOT) is included instead —
// the opposite of what is staged.
// GROUP: staged-run-scopes-to-touched-files
test('a staged run scopes to data files that touch what is staged, not every file on disk', () => {
  assert.match(
    stagedScopeRun.stdout,
    /scope-a\.mutations\.json/,
    `stdout:\n${stagedScopeRun.stdout}`,
  )
  assert.doesNotMatch(
    stagedScopeRun.stdout,
    /scope-b\.mutations\.json/,
    `stdout:\n${stagedScopeRun.stdout}`,
  )
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// --staged end to end: the data file's own content comes from the INDEX, not the working tree
//
// Fixture: a committed guard (target + suite + data file, `id: "committed-id"`). Afterward, the
// data file's WORKING-TREE copy is overwritten with a different id (`unstaged-id`) — never
// `git add`-ed. A change to the target is staged, so the guard is in scope. The run must grade
// the file as it sits in the INDEX (still `committed-id`), never the unstaged edit sitting on
// top of it.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

function buildDataFileFixture(id) {
  return JSON.stringify({
    target: 'd.mjs',
    suites: ['d.test.mjs'],
    mutations: [
      {
        id,
        find: 'export const d = 1',
        replace: 'export const d = 2',
        expectRed: ['a-test-that-never-fires'],
      },
    ],
  })
}

function buildStagedDataDivergesRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'rm-staged-diverge-'))
  const g = gitRunner(dir)
  g(['init', '-q', '.'])
  g(['config', 'user.email', 'test@test'])
  g(['config', 'user.name', 'test'])
  writeFileSync(join(dir, 'd.mjs'), 'export const d = 1\n')
  writeFileSync(join(dir, 'd.test.mjs'), fixedGreenSuite('d-ok'))
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true })
  writeFileSync(
    join(dir, '.claude', 'hooks', 'diverge.mutations.json'),
    buildDataFileFixture('committed-id'),
  )
  g(['add', 'd.mjs', 'd.test.mjs', '.claude/hooks/diverge.mutations.json'])
  g(['commit', '-q', '-m', 'init'])
  // Put the guard in scope for --staged by staging a change to its target only.
  writeFileSync(join(dir, 'd.mjs'), 'export const d = 1\nexport const d2 = 2\n')
  g(['add', 'd.mjs'])
  // Overwrite the data file's WORKING-TREE copy — never staged. If this were graded, the run
  // would report `unstaged-id`, which the committed/staged copy does not carry.
  writeFileSync(
    join(dir, '.claude', 'hooks', 'diverge.mutations.json'),
    buildDataFileFixture('unstaged-id'),
  )
  return dir
}

const stagedDivergeDir = buildStagedDataDivergesRepo()
const stagedDivergeRun = runNode(
  'harness --staged --guard diverge with an unstaged-only data-file edit',
  [HARNESS, '--staged', '--guard', 'diverge'],
  { cwd: stagedDivergeDir, env: envWithoutTestContext },
)

// MUTATION: replace `loadScoped`'s staged-branch `loadDataFileAt(root, file, ref)` call with
// `loadDataFile(file)` → the data file is read from the WORKING TREE regardless of `--staged`, so
// the unstaged `unstaged-id` edit gets graded instead of the committed/staged `committed-id`.
// GROUP: staged-run-reads-data-file-at-index
test('a --staged run grades the data file as staged, not an unstaged-only edit sitting on top', () => {
  assert.match(stagedDivergeRun.stdout, /committed-id/, `stdout:\n${stagedDivergeRun.stdout}`)
  assert.doesNotMatch(stagedDivergeRun.stdout, /unstaged-id/, `stdout:\n${stagedDivergeRun.stdout}`)
})
