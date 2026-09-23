// Run: node --test .claude/hooks/check-md-allowlist.repo.test.mjs
//
// The git-facing and subprocess paths of the md-allowlist guard: staged scoping, the `--all`
// whole-tree mode, the allowlist and `.gitignore` reads, and the exit-code split. The pure
// decision logic lives in check-md-allowlist.test.mjs, so neither file approaches the test-file
// cap in .claude/limits.json.
//
// Every case is MUTATION-PINNED: the opening comment names the break that turns it red, and
// every break was EXECUTED before being written down (`code-style.md` §7 — a `MUTATION:` line
// is a prose claim). Some breaks redden a GROUP of cases rather than one; those carry a
// `GROUP:` marker naming the mutation id. The EXACT set each break reddens is DATA, in
// check-md-allowlist.mutations.json, and `node .claude/hooks/run-mutations.mjs --guard
// check-md-allowlist` re-derives it — do not hand-maintain a second copy here.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runNode } from './spawn.testkit.mjs'

const GUARD = join(dirname(fileURLToPath(import.meta.url)), 'check-md-allowlist.mjs')

const ALLOWLIST = {
  dirs: ['.claude/rules/'],
  files: ['docs/security.md'],
  basenames: ['CLAUDE.md'],
}

/** A throwaway repo, removed however the body exits. */
function withRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'md-allowlist-'))
  try {
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
    git('init', '-q', '.')
    git('config', 'user.email', 't@example.com')
    git('config', 'user.name', 'Test')
    // Isolate from the RUNNER's global git config: a global `commit.gpgsign=true` makes every
    // fixture commit demand a signing key, and a global `core.hooksPath` runs someone else's
    // hooks inside these throwaway repos. Either way the failure looks like a guard bug.
    git('config', 'commit.gpgsign', 'false')
    git('config', 'core.hooksPath', join(dir, '.git', 'no-hooks'))
    const write = (rel, body) => {
      mkdirSync(join(dir, dirname(rel)), { recursive: true })
      writeFileSync(join(dir, rel), body)
    }
    write('.claude/md-allowlist.json', JSON.stringify(ALLOWLIST))
    write('.gitignore', '.work/\n.spec-workflow/specs/*\n')
    return fn({ dir, git, write })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Run the guard in `dir`. `runNode`, not `execFileSync`: the latter surfaces stderr only on
 *  the THROWING path, so a case asserting on a SUCCESSFUL run's diagnostics would compare
 *  against an empty string. */
function run({ dir }, args = []) {
  const { status, stderr, stdout } = runNode('check-md-allowlist', [GUARD, ...args], { cwd: dir })
  return { status, stderr, stdout }
}

// ---------------------------------------------------------------- enforcement

// CONTROL: red
// GROUP: check-md-allowlist-always-passes
test('blocks staging a new markdown file outside the allowlist', () =>
  withRepo((r) => {
    r.write('docs/notes.md', 'a maintenance note\n')
    r.git('add', '-A')
    // MUTATION: return 0 unconditionally from main → every new markdown file, anywhere, ships
    // unchecked and the allowlist stops meaning anything.
    const res = run(r)
    assert.equal(res.status, 1)
    assert.match(res.stderr, /docs\/notes\.md/)
    assert.match(res.stderr, /move it to \.work\//)
  }))

// CONTROL: green
// GROUP: check-md-allowlist-always-blocks, dirs-branch-dropped
test('allows staging a new markdown file under a listed directory', () =>
  withRepo((r) => {
    r.write('.claude/rules/new-rule.md', 'a new rule\n')
    r.git('add', '-A')
    // MUTATION: drop the `allow.dirs.some(...)` branch from isAllowed → the rule file itself,
    // the thing this guard is supposed to let through, is reported as an offender.
    assert.equal(run(r).status, 0)
  }))

// GROUP: files-branch-dropped
test('allows staging an exact listed file', () =>
  withRepo((r) => {
    r.write('docs/security.md', 'a security rule\n')
    r.git('add', '-A')
    assert.equal(run(r).status, 0)
  }))

// GROUP: basenames-branch-dropped
test('allows staging a listed basename under a new directory', () =>
  withRepo((r) => {
    r.write('apps/web/CLAUDE.md', 'app-scoped guidance\n')
    r.git('add', '-A')
    assert.equal(run(r).status, 0)
  }))

// GROUP: addedpaths-pushes-every-status
test('does not block modifying an existing disallowed markdown file', () =>
  withRepo((r) => {
    r.write('docs/notes.md', 'a maintenance note\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init (pre-existing offender, not this guard’s concern)')
    r.write('docs/notes.md', 'a maintenance note, edited\n')
    r.git('add', '-A')
    // MUTATION: push a path for every status in addedPaths, not only A/R/C → editing an
    // existing offender becomes a blocking finding, so introducing the guard blocks every repo
    // carrying one until the whole tree is clean.
    assert.equal(run(r).status, 0)
  }))

// GROUP: addedpaths-rename-pushes-source
test('blocks renaming an existing file into a disallowed path', () =>
  withRepo((r) => {
    r.write('.claude/rules/old.md', 'a rule\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    mkdirSync(join(r.dir, 'docs'), { recursive: true })
    r.git('mv', '.claude/rules/old.md', 'docs/renamed.md')
    // MUTATION: take the SOURCE instead of the DESTINATION for an R/C record in addedPaths → a
    // rename into a disallowed folder is invisible to this guard.
    const res = run(r)
    assert.equal(res.status, 1)
    assert.match(res.stderr, /docs\/renamed\.md/)
  }))

// ---------------------------------------------------------------- spec re-include

// GROUP: specdirs-loop-dropped, spec-reinclude-no-trailing-slash
test('allows a new file under a spec directory the .gitignore re-includes', () =>
  withRepo((r) => {
    r.write('.gitignore', '.work/\n.spec-workflow/specs/*\n!.spec-workflow/specs/demo/\n')
    r.write('.spec-workflow/specs/demo/tasks.md', 'a task list\n')
    r.git('add', '-A')
    assert.equal(run(r).status, 0)
  }))

test('blocks a new file under a spec directory the .gitignore never re-includes', () =>
  withRepo((r) => {
    r.write('.spec-workflow/specs/other/tasks.md', 'a task list\n')
    r.git('add', '-f', '.spec-workflow/specs/other/tasks.md')
    const res = run(r)
    assert.equal(res.status, 1)
    assert.match(res.stderr, /specs\/other\/tasks\.md/)
  }))

// ---------------------------------------------------------------- scoping: staged vs --all

// GROUP: candidates-mode-ternary-inverted
test('scopes a finding to the staged additions, but --all grades the whole worktree', () =>
  withRepo((r) => {
    r.write('docs/untouched.md', 'an old offender, never staged this commit\n')
    r.write('docs/b.ts', 'export const x = 1\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('docs/b.ts', 'export const x = 2\n')
    r.git('add', '-A')
    // MUTATION: invert the `all` condition on the candidates ternary → the plain pre-commit run
    // enumerates the whole worktree (blocking on the untouched pre-existing offender) and --all
    // reads only the staged diff (missing it), swapping the two modes' scope.
    assert.equal(run(r).status, 0, 'pre-commit: the offender was never staged this commit')
    assert.equal(run(r, ['--all']).status, 1, 'CI: the whole worktree is graded')
  }))

// ---------------------------------------------------------------- fail closed

test('exits 2 on an unreadable allowlist file', () =>
  withRepo((r) => {
    r.write('docs/notes.md', 'x\n')
    r.git('add', '-A')
    rmSync(join(r.dir, '.claude/md-allowlist.json'))
    mkdirSync(join(r.dir, '.claude/md-allowlist.json'))
    // Structural: loadAllowlist has no catch around its read, so an EISDIR here propagates to
    // the top-level try/catch unmodified. Nothing to mutate — the absence of a swallow IS the
    // behaviour under test.
    const res = run(r)
    assert.equal(res.status, 2)
    assert.match(res.stderr, /check could not run — BLOCKING/)
  }))

// GROUP: loadallowlist-baddir-slash-check
test('exits 2 when a dirs entry does not end in a slash', () =>
  withRepo((r) => {
    r.write(
      '.claude/md-allowlist.json',
      JSON.stringify({ dirs: ['.claude/rules'], files: [], basenames: [] }),
    )
    r.write('docs/notes.md', 'x\n')
    r.git('add', '-A')
    // MUTATION: drop the `badDir !== undefined` throw in loadAllowlist → a dirs entry missing
    // its trailing slash makes `.startsWith(d)` match any SIBLING directory sharing the
    // prefix, a false allow.
    const res = run(r)
    assert.equal(res.status, 2)
    assert.match(res.stderr, /must end in/)
  }))

test('exits 2 when the allowlist JSON is malformed', () =>
  withRepo((r) => {
    r.write('.claude/md-allowlist.json', '{ "dirs": [')
    r.write('docs/notes.md', 'x\n')
    r.git('add', '-A')
    const res = run(r)
    assert.equal(res.status, 2)
    assert.match(res.stderr, /check could not run — BLOCKING/)
  }))

// GROUP: loadallowlist-toplevel-not-object
test('exits 2 when the allowlist top level is not an object', () =>
  withRepo((r) => {
    r.write('.claude/md-allowlist.json', '[]')
    r.write('docs/notes.md', 'x\n')
    r.git('add', '-A')
    // MUTATION: drop the `obj === null || typeof obj !== 'object' || Array.isArray(obj)` guard
    // in loadAllowlist → an array allowlist is read as an object with no `dirs`, and the
    // diagnostic misreports which check actually failed.
    const res = run(r)
    assert.equal(res.status, 2)
    assert.match(res.stderr, /top level must be an object/)
  }))

// GROUP: loadallowlist-dirs-not-string-array
test('exits 2 when dirs is not an array', () =>
  withRepo((r) => {
    r.write('.claude/md-allowlist.json', JSON.stringify({ dirs: 'nope', files: [], basenames: [] }))
    r.write('docs/notes.md', 'x\n')
    r.git('add', '-A')
    // MUTATION: drop the `isStringArray(obj.dirs)` check in loadAllowlist → a string `dirs`
    // reaches `obj.dirs.find(...)`, which does not exist on a string, and the diagnostic
    // misreports a TypeError instead of the actual shape problem.
    const res = run(r)
    assert.equal(res.status, 2)
    assert.match(res.stderr, /`dirs` must be a string array/)
  }))

// GROUP: loadallowlist-files-not-string-array
test('exits 2 when files is not an array', () =>
  withRepo((r) => {
    r.write('.claude/md-allowlist.json', JSON.stringify({ dirs: [], files: 'nope', basenames: [] }))
    r.write('docs/notes.md', 'x\n')
    r.git('add', '-A')
    // MUTATION: drop the `isStringArray(obj.files)` check in loadAllowlist → a string `files`
    // reaches `isAllowed`'s `allow.files.includes(path)`, which still runs (strings have
    // `.includes`), silently comparing against characters instead of listed file paths.
    const res = run(r)
    assert.equal(res.status, 2)
    assert.match(res.stderr, /`files` must be a string array/)
  }))

// GROUP: loadallowlist-basenames-not-string-array
test('exits 2 when basenames is not an array', () =>
  withRepo((r) => {
    r.write('.claude/md-allowlist.json', JSON.stringify({ dirs: [], files: [], basenames: 'nope' }))
    r.write('docs/notes.md', 'x\n')
    r.git('add', '-A')
    // MUTATION: drop the `isStringArray(obj.basenames)` check in loadAllowlist → a string
    // `basenames` reaches `isAllowed`'s `allow.basenames.includes(...)` unchecked, the same
    // silent character-comparison hazard as the `files` case above.
    const res = run(r)
    assert.equal(res.status, 2)
    assert.match(res.stderr, /`basenames` must be a string array/)
  }))

test('exits 2 when .gitignore is unreadable', () =>
  withRepo((r) => {
    r.write('docs/notes.md', 'x\n')
    r.git('add', '-A')
    rmSync(join(r.dir, '.gitignore'))
    mkdirSync(join(r.dir, '.gitignore'))
    // Structural: specDirsFrom's readFileSync call has no catch either, so this pins the same
    // absence-of-swallow property as the allowlist read above, for the other required file.
    const res = run(r)
    assert.equal(res.status, 2)
    assert.match(res.stderr, /check could not run — BLOCKING/)
  }))

// ---------------------------------------------------------------- argument parsing, end to end

// GROUP: main-unknown-flag-check-dropped
test('refuses an unknown flag at the CLI boundary, spawned end to end', () =>
  withRepo((r) => {
    const res = runNode('check-md-allowlist', [GUARD, '--bogus'], { cwd: r.dir })
    assert.equal(res.status, 2)
    assert.match(res.stderr, /unknown flag/)
  }))
