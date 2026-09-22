// Run: node --test .claude/hooks/run-mutations.staged.test.mjs
//
// Coverage for `--staged`: grades the INDEX rather than HEAD, scoped to the data files
// `touchesStaged` keeps. A SIBLING file, not a section of
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
// Every case carrying a mutation claim is pinned by a GROUP marker into
// `run-mutations.mutations.json` — `--coverage` is the check, not this sentence; a few smoke
// tests carry neither and claim no coverage.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseArgs } from './run-mutations.mjs'
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

// Every fixture repo this file builds, removed when the run ends. Without this each execution
// leaves its repos under tmpdir() — and the file is a `suites` entry, so the harness re-runs it
// once per graded mutation.
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
// parseArgs — --staged
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// MUTATION: delete the `opts.staged && modes.length > 0` guard in `parseArgs` → `--staged
// --coverage` silently proceeds into coverage mode instead of refusing an unsupported combination
// the rest of the harness was never built to grade.
// GROUP: staged-rejects-other-modes, boolean-flag-not-recognized
test('rejects --staged combined with a mode flag', () => {
  assert.match(parseArgs(['--staged', '--coverage']).error, /--staged only applies to a plain run/)
  assert.match(parseArgs(['--list', '--staged']).error, /--staged only applies to a plain run/)
})

// MUTATION: drop the `BOOLEAN_FLAGS.has(a)` block in `parseArgs` → `--staged` is treated as an
// unknown flag, so any invocation passing `--staged` exits 2 with a usage error instead of running.
// GROUP: boolean-flag-not-recognized
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
  const { dir, g } = newRepo('rm-staged-idx-')
  g(['commit', '-q', '--allow-empty', '-m', 'init'])
  writeFileSync(join(dir, 'target.mjs'), 'export const target = 1\n')
  writeFileSync(join(dir, 'target.test.mjs'), fixedGreenSuite('placeholder'))
  g(['add', 'target.mjs', 'target.test.mjs'])
  writeGuard(dir, 'idx-fixture', 'target.mjs')
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
  assert.match(stagedIdxRun.stdout, /touch-target/, `stdout:\n${stagedIdxRun.stdout}`)
  assert.match(stagedIdxRun.stdout, /SURVIVED/, `stdout:\n${stagedIdxRun.stdout}`)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// --staged end to end: scope
//
// Fixture: two committed guards, `scope-a` (target a.mjs) and `scope-b` (target b.mjs). Only
// a.mjs is staged afterward. A `--staged` run with no `--guard` must grade scope-a and skip scope-b.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

function buildStagedScopeRepo() {
  const { dir, g } = newRepo('rm-staged-scope-')
  for (const letter of ['a', 'b']) {
    writeFileSync(join(dir, `${letter}.mjs`), `export const ${letter} = 1\n`)
    writeFileSync(join(dir, `${letter}.test.mjs`), fixedGreenSuite(`${letter}-ok`))
    writeGuard(dir, `scope-${letter}`, `${letter}.mjs`)
  }
  // Both guards, TRACKED, committed at HEAD — same as any pre-existing guard the branch doesn't
  // touch. loadDataFileAt reads a data file's content from the INDEX, which mirrors HEAD for any
  // file this commit leaves alone, so an untouched guard's data file is still gradable.
  g(['add', '-A'])
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
// GROUP: staged-run-scopes-to-touched-files, touchesstaged-always-in-scope
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
  const { dir, g } = newRepo('rm-staged-diverge-')
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

// MUTATION: delete `blobAt`'s empty-`git ls-tree` check (let `git show` run
// unguarded) → scoping a guard whose suite has no copy at the ref throws out of the filter, so an
// unrelated guard with a missing suite aborts the whole run instead of being scoped out of it.
// GROUP: blobat-absent-returns-null
test('a guard whose suite is absent at the ref is scoped out, not a fault', () => {
  const { dir, g } = newRepo('rm-staged-missing-')
  for (const letter of ['e', 'f']) {
    writeFileSync(join(dir, `${letter}.mjs`), `export const ${letter} = 1\n`)
    writeGuard(dir, `probe-${letter}`, `${letter}.mjs`)
  }
  // e.test.mjs exists; f.test.mjs is named by probe-f's data file but committed nowhere. Only
  // e.mjs is staged, so probe-f is out of scope — reaching its missing suite at all is the defect.
  writeFileSync(join(dir, 'e.test.mjs'), fixedGreenSuite('e-ok'))
  g(['add', '-A'])
  g(['commit', '-q', '-m', 'init'])
  writeFileSync(join(dir, 'e.mjs'), 'export const e = 1\nexport const e2 = 2\n')
  g(['add', 'e.mjs'])
  const run = runNode(
    'harness --staged with an out-of-scope guard missing its suite',
    [HARNESS, '--staged'],
    {
      cwd: dir,
      env: envWithoutTestContext,
    },
  )
  const out = `${run.stdout}${run.stderr}`
  assert.doesNotMatch(out, /does not exist in/, out)
  assert.match(out, /touch-e/, out)
  assert.doesNotMatch(out, /touch-f/, out)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// --staged: data file absent from the index is dropped rather than faulting the run
//
// Fixture: one data file that exists on disk but was never staged or committed. Its target is
// staged, so without the existence probe `loadDataFileAt` would call `git show` directly, which
// throws on a missing object — aborting the run with exit 2. With the probe the file is returned
// as null and filtered out; the scoped list is empty and the run exits 0 instead.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// MUTATION: delete the `git ls-tree` existence probe from `blobAt` (let `git show` run
// unguarded) → when the data file is absent from the index commit, `git show` throws rather
// than returning null, so the run faults with exit 2 instead of gracefully dropping the file and
// printing the "nothing staged touches" message.
// GROUP: blobat-absent-returns-null
test('a data file on disk but absent from the index is dropped without faulting the run', () => {
  const { dir, g } = newRepo('rm-staged-absent-df-')
  g(['commit', '-q', '--allow-empty', '-m', 'init'])
  writeFileSync(join(dir, 'abs.mjs'), 'export const abs = 1\n')
  writeFileSync(join(dir, 'abs.test.mjs'), fixedGreenSuite('abs-ok'))
  writeGuard(dir, 'absent-df', 'abs.mjs')
  // Stage target and suite but NOT the data file — it lives only on disk.
  g(['add', 'abs.mjs', 'abs.test.mjs'])
  const run = runNode(
    'harness --staged with data file absent from index',
    [HARNESS, '--staged', '--guard', 'absent-df'],
    { cwd: dir, env: envWithoutTestContext },
  )
  assert.equal(run.status, 0, `stderr:\n${run.stderr}`)
  assert.match(run.stdout, /nothing staged touches/, run.stdout)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// --staged: empty scope exits 0, not 2
//
// Fixture: one committed guard. Only an unrelated file is staged — nothing that touches the
// guard's data file, target, or suite. Under --staged this is a commit the harness has no claim
// to grade, and the exit must be 0, not 2 (which would wrongly block the pre-commit gate on every
// commit that does not touch a guarded file).
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// MUTATION: change the `return 0` in `modeRun`'s `scoped.length === 0` branch to `return 2` →
// a staged set touching no guard exits 2 ("NO VERDICT") instead of 0, blocking the pre-commit
// gate on any commit that doesn't touch a guarded file, which is the common case.
// GROUP: staged-empty-scope-exits-zero
test('a --staged run exits 0 when nothing staged is in the scope of any guard', () => {
  const { dir, g } = newRepo('rm-staged-noscope-')
  writeFileSync(join(dir, 'ns.mjs'), 'export const ns = 1\n')
  writeFileSync(join(dir, 'ns.test.mjs'), fixedGreenSuite('ns-ok'))
  writeGuard(dir, 'no-scope', 'ns.mjs')
  writeFileSync(join(dir, 'unrelated.txt'), 'hello\n')
  g(['add', '-A'])
  g(['commit', '-q', '-m', 'init'])
  writeFileSync(join(dir, 'unrelated.txt'), 'changed\n')
  g(['add', 'unrelated.txt'])
  const run = runNode('harness --staged with no guard in scope exits 0', [HARNESS, '--staged'], {
    cwd: dir,
    env: envWithoutTestContext,
  })
  assert.equal(run.status, 0, `stderr:\n${run.stderr}`)
  assert.match(run.stdout, /nothing staged touches/, run.stdout)
})

// MUTATION: drop `--no-renames` from `stagedPaths` → a staged rename lists only the NEW path, so the
// guard whose target moved away is scoped out and the run exits 0 having graded nothing.
// GROUP: staged-paths-no-renames
test('a --staged run keeps a guard in scope when its target is renamed away', () => {
  const { dir, g } = newRepo('rm-staged-rename-')
  writeFileSync(join(dir, 'rn.mjs'), 'export const rn = 1\n')
  writeFileSync(join(dir, 'rn.test.mjs'), fixedGreenSuite('rn-ok'))
  writeGuard(dir, 'rename', 'rn.mjs')
  g(['add', '-A'])
  g(['commit', '-q', '-m', 'init'])
  g(['mv', 'rn.mjs', 'moved.mjs'])
  const run = runNode('harness --staged after renaming a guarded target', [HARNESS, '--staged'], {
    cwd: dir,
    env: envWithoutTestContext,
  })
  assert.notEqual(run.status, 0, `stdout:\n${run.stdout}`)
  assert.doesNotMatch(run.stdout, /nothing staged touches/, run.stdout)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// --staged: indexCommit diagnostics for unborn HEAD and unresolved merge conflicts
//
// Both paths are in `indexCommit` and are NOT exported, so they need spawn-level tests against a
// real repo whose git state forces the failing command. The diagnostic message is part of what the
// test pins: a mutation that strips the key phrase makes the `match` assertion fail while the exit
// code stays 2, so exit-code-only assertions would miss it.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// MUTATION: change the error message in `indexCommit`'s `commit-tree` catch block so it no
// longer contains "unborn HEAD" → the user sees a generic error and cannot tell that the repo
// needs an initial commit before `--staged` can be used.
// GROUP: staged-unborn-head-diagnostic
test('reports a diagnostic when HEAD is unborn under --staged', () => {
  // No commits — HEAD is unborn. `selectFiles` reads the filesystem so a staged-only data file
  // is still visible to it; `indexCommit` is reached, `write-tree` succeeds, `commit-tree -p
  // HEAD` fails, and the catch emits the "unborn HEAD?" diagnostic.
  const { dir, g } = newRepo('rm-staged-unborn-')
  writeFileSync(join(dir, 'ub.mjs'), 'export const ub = 1\n')
  writeFileSync(join(dir, 'ub.test.mjs'), fixedGreenSuite('ub-ok'))
  writeGuard(dir, 'unborn-guard', 'ub.mjs')
  g(['add', 'ub.mjs', 'ub.test.mjs', '.claude/hooks/unborn-guard.mutations.json'])
  const run = runNode(
    'harness --staged with unborn HEAD exits 2 with diagnostic',
    [HARNESS, '--staged', '--guard', 'unborn-guard'],
    { cwd: dir, env: envWithoutTestContext },
  )
  assert.equal(run.status, 2, `stderr:\n${run.stderr}`)
  assert.match(run.stderr, /unborn HEAD/, `stderr:\n${run.stderr}`)
})

// MUTATION: change the error message in `indexCommit`'s `write-tree` catch block so it no longer
// contains "unresolved merge conflicts" → the user sees a generic git error and cannot tell the
// index is in a conflicted state.
// GROUP: staged-unmerged-index-diagnostic
test('reports a diagnostic when the index has unresolved conflicts under --staged', () => {
  // Build a repo where two branches edit the same file differently, then merge to leave the index
  // in a conflicted state. `git write-tree` refuses an index with unmerged entries, and the catch
  // wraps that failure in the "unresolved merge conflicts?" diagnostic.
  const { dir, g } = newRepo('rm-staged-conflicts-')
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true })
  writeFileSync(
    join(dir, '.claude', 'hooks', 'cflt-guard.mutations.json'),
    JSON.stringify({
      target: 'cflt.mjs',
      suites: ['cflt.test.mjs'],
      mutations: [{ id: 'cflt-touch', find: 'x = 1', replace: 'x = 2', expectRed: ['never'] }],
    }),
  )
  writeFileSync(join(dir, 'cflt.mjs'), 'const x = 1\n')
  writeFileSync(join(dir, 'cflt.test.mjs'), fixedGreenSuite('cflt-ok'))
  writeFileSync(join(dir, 'conflict.txt'), 'original\n')
  g(['add', '-A'])
  g(['commit', '-q', '-m', 'init'])
  const mainBranch = g(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim()
  g(['checkout', '-q', '-b', 'side'])
  writeFileSync(join(dir, 'conflict.txt'), 'side version\n')
  g(['add', 'conflict.txt'])
  g(['commit', '-q', '-m', 'side change'])
  g(['checkout', '-q', mainBranch])
  writeFileSync(join(dir, 'conflict.txt'), 'main version\n')
  g(['add', 'conflict.txt'])
  g(['commit', '-q', '-m', 'main change'])
  // Merge creates unresolved conflicts in the index; it exits non-zero so we cannot use g().
  spawnSync('git', ['merge', 'side', '--no-ff', '--no-edit'], {
    cwd: dir,
    encoding: 'utf8',
    env: testEnv,
  })
  const run = runNode(
    'harness --staged with unresolved merge conflicts exits 2 with diagnostic',
    [HARNESS, '--staged', '--guard', 'cflt-guard'],
    { cwd: dir, env: envWithoutTestContext },
  )
  assert.equal(run.status, 2, `stderr:\n${run.stderr}`)
  assert.match(run.stderr, /unresolved merge conflict/, `stderr:\n${run.stderr}`)
})
