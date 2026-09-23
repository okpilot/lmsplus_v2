// Run: node --test .claude/hooks/check-md-allowlist.repo.test.mjs
//
// The git-facing and subprocess paths of the md-allowlist guard: staged scoping, the `--all`
// every-tracked-path mode, the allowlist and `.gitignore` reads, and the exit-code split. The pure
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
// GROUP: check-md-allowlist-always-passes, isallowed-fallback-inverted
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

// GROUP: files-branch-dropped, check-md-allowlist-always-blocks
test('allows staging an exact listed file', () =>
  withRepo((r) => {
    r.write('docs/security.md', 'a security rule\n')
    r.git('add', '-A')
    assert.equal(run(r).status, 0)
  }))

// GROUP: basenames-branch-dropped, check-md-allowlist-always-blocks
test('allows staging a listed basename under a new directory', () =>
  withRepo((r) => {
    r.write('apps/web/CLAUDE.md', 'app-scoped guidance\n')
    r.git('add', '-A')
    assert.equal(run(r).status, 0)
  }))

// GROUP: staged-diff-filter-widened, candidates-mode-ternary-inverted,
// check-md-allowlist-always-blocks
test('does not block modifying an existing disallowed markdown file', () =>
  withRepo((r) => {
    r.write('docs/notes.md', 'a maintenance note\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init (pre-existing offender, not this guard’s concern)')
    r.write('docs/notes.md', 'a maintenance note, edited\n')
    r.git('add', '-A')
    // MUTATION: widen `--diff-filter=A` to also admit modifications → editing an existing
    // offender blocks the commit. Pre-commit grades additions only; --all, every tracked path.
    assert.equal(run(r).status, 0)
  }))

// GROUP: staged-renames-not-disabled, isallowed-fallback-inverted,
// check-md-allowlist-always-passes
test('blocks renaming an existing file into a disallowed path', () =>
  withRepo((r) => {
    r.write('.claude/rules/old.md', 'a rule\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    mkdirSync(join(r.dir, 'docs'), { recursive: true })
    r.git('mv', '.claude/rules/old.md', 'docs/renamed.md')
    // MUTATION: drop `--no-renames` → git's default rename detection reports the pair as `R100`,
    // which `--diff-filter=A` excludes, so a rename into a disallowed folder is invisible.
    const res = run(r)
    assert.equal(res.status, 1)
    assert.match(res.stderr, /docs\/renamed\.md/)
  }))

// ---------------------------------------------------------------- spec re-include

// GROUP: specdirs-loop-dropped, spec-reinclude-no-trailing-slash,
// check-md-allowlist-always-blocks
test('allows a new file under a spec directory the .gitignore re-includes', () =>
  withRepo((r) => {
    r.write('.gitignore', '.work/\n.spec-workflow/specs/*\n!.spec-workflow/specs/demo/\n')
    r.write('.spec-workflow/specs/demo/tasks.md', 'a task list\n')
    r.git('add', '-A')
    assert.equal(run(r).status, 0)
  }))

// GROUP: isallowed-fallback-inverted, check-md-allowlist-always-passes
test('blocks a new file under a spec directory the .gitignore never re-includes', () =>
  withRepo((r) => {
    r.git('add', '-A')
    r.write('.spec-workflow/specs/other/tasks.md', 'a task list\n')
    r.git('add', '-f', '.spec-workflow/specs/other/tasks.md')
    const res = run(r)
    assert.equal(res.status, 1)
    assert.match(res.stderr, /specs\/other\/tasks\.md/)
  }))

// ---------------------------------------------------------------- index reads, not working-tree reads

// GROUP: loadallowlist-index-read-swapped, isallowed-fallback-inverted,
// check-md-allowlist-always-passes
test('reads the allowlist from the INDEX, ignoring an unstaged working-tree edit', () =>
  withRepo((r) => {
    r.write('docs/notes.md', 'a maintenance note\n')
    r.git('add', '-A')
    // Widens the allowlist to admit docs/ — on disk only, never staged. The guard must still
    // see the STAGED (narrower) allowlist and block the file written above.
    r.write(
      '.claude/md-allowlist.json',
      JSON.stringify({ ...ALLOWLIST, dirs: [...ALLOWLIST.dirs, 'docs/'] }),
    )
    // MUTATION: read the allowlist from the working tree instead of the index → the unstaged
    // widening above is consulted, and a file about to be committed under a stale allowlist
    // ships unchecked.
    const res = run(r)
    assert.equal(res.status, 1)
    assert.match(res.stderr, /docs\/notes\.md/)
  }))

// GROUP: gitignore-index-read-swapped, isallowed-fallback-inverted,
// check-md-allowlist-always-passes
test('reads .gitignore from the INDEX, ignoring an unstaged working-tree re-include', () =>
  withRepo((r) => {
    r.git('add', '-A')
    r.write('.spec-workflow/specs/demo/tasks.md', 'a task list\n')
    r.git('add', '-f', '.spec-workflow/specs/demo/tasks.md')
    // Re-includes the spec dir — on disk only, never staged. The guard must still see the
    // STAGED (non-re-included) .gitignore and block the spec markdown.
    r.write('.gitignore', '.work/\n.spec-workflow/specs/*\n!.spec-workflow/specs/demo/\n')
    // MUTATION: read .gitignore from the working tree instead of the index → the unstaged
    // re-include above is consulted, and a spec file about to be committed under a stale
    // .gitignore ships unchecked.
    const res = run(r)
    assert.equal(res.status, 1)
    assert.match(res.stderr, /specs\/demo\/tasks\.md/)
  }))

// ---------------------------------------------------------------- scoping: staged vs --all

// GROUP: candidates-mode-ternary-inverted, isallowed-fallback-inverted,
// check-md-allowlist-always-passes, check-md-allowlist-always-blocks
test('scopes a finding to the staged additions, but --all grades every tracked path', () =>
  withRepo((r) => {
    r.write('docs/untouched.md', 'an old offender, never staged this commit\n')
    r.write('docs/b.ts', 'export const x = 1\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('docs/b.ts', 'export const x = 2\n')
    r.git('add', '-A')
    // MUTATION: invert the `all` condition on the candidates ternary → the plain pre-commit run
    // enumerates every tracked path (blocking on the untouched pre-existing offender) and --all
    // reads only the staged diff (missing it), swapping the two modes' scope.
    assert.equal(run(r).status, 0, 'pre-commit: the offender was never staged this commit')
    assert.equal(run(r, ['--all']).status, 1, 'CI: every tracked path is graded')
  }))

// GROUP: all-pathspec-dropped, candidates-mode-ternary-inverted, isallowed-fallback-inverted,
// gitignore-index-read-swapped, loadallowlist-index-read-swapped, check-md-allowlist-always-passes
test('--all grades every tracked path even when spawned from a subdirectory', () =>
  withRepo((r) => {
    r.write('docs/bad.md', 'a maintenance note\n')
    r.write('sub/x.txt', 'placeholder\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    // MUTATION: drop the `'--', ':/'` pathspec from the --all `ls-files` call → the enumeration
    // is scoped to git's CURRENT WORKING DIRECTORY subtree, not the whole index, so a run
    // spawned from `sub/` never sees the offender outside it.
    const res = runNode('check-md-allowlist', [GUARD, '--all'], { cwd: join(r.dir, 'sub') })
    assert.equal(res.status, 1)
    assert.match(res.stderr, /docs\/bad\.md/)
  }))

// ---------------------------------------------------------------- fail closed

// GROUP: loadallowlist-index-read-swapped
test('exits 2 when the allowlist is absent from the index', () =>
  withRepo((r) => {
    r.write('docs/notes.md', 'x\n')
    r.git('add', '-A')
    r.git('rm', '--cached', '-q', '.claude/md-allowlist.json')
    // Structural: loadAllowlist reads via `git show :<path>`, which fails when the path is not
    // in the index; nothing catches that inside loadAllowlist, so it propagates to the
    // top-level try/catch unmodified. A working-tree read finds the file on disk → exit 1.
    const res = run(r)
    assert.equal(res.status, 2)
    assert.match(res.stderr, /check could not run — BLOCKING/)
  }))

// GROUP: isstringarray-every-check-dropped, loadallowlist-dirs-not-string-array
test('exits 2 when a dirs entry is present but not a string', () =>
  withRepo((r) => {
    r.write('.claude/md-allowlist.json', JSON.stringify({ dirs: [123], files: [], basenames: [] }))
    r.write('docs/notes.md', 'x\n')
    r.git('add', '-A')
    // MUTATION: drop the `.every((x) => typeof x === 'string')` conjunct from isStringArray,
    // leaving only `Array.isArray(v)` → a dirs array holding a non-string element passes this
    // check and reaches `.endsWith('/')` in the badDir check, which throws a TypeError instead
    // (still exit 2, but with a different, uninformative diagnostic).
    const res = run(r)
    assert.equal(res.status, 2)
    assert.match(res.stderr, /`dirs` must be a string array/)
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

// GROUP: loadallowlist-jsonparse-prefix-dropped
test('exits 2 when the allowlist JSON is malformed', () =>
  withRepo((r) => {
    r.write('.claude/md-allowlist.json', '{ "dirs": [')
    r.write('docs/notes.md', 'x\n')
    r.git('add', '-A')
    // MUTATION: drop the `${ALLOWLIST_PATH}: ` prefix from the re-thrown parse error → the
    // diagnostic reads as a bare `Unexpected end of JSON input`, giving no hint which file is
    // malformed.
    const res = run(r)
    assert.equal(res.status, 2)
    assert.match(res.stderr, /check could not run — BLOCKING/)
    assert.match(res.stderr, /\.claude\/md-allowlist\.json:/)
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

// GROUP: gitignore-index-read-swapped
test('exits 2 when .gitignore is absent from the index', () =>
  withRepo((r) => {
    r.write('docs/notes.md', 'x\n')
    r.git('add', '-A')
    r.git('rm', '--cached', '-q', '.gitignore')
    // Structural: main's `git show :.gitignore` call has no catch either, so this pins the same
    // absence-of-swallow property as the allowlist read above, for the other required file.
    // A working-tree read finds the file on disk instead → exit 1.
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
