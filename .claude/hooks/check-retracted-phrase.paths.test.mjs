// Run: node --test .claude/hooks/check-retracted-phrase.paths.test.mjs
//
// PATH HANDLING: how the guard spells, compares and resolves the paths git hands it. Split out of
// check-retracted-phrase.repo.test.mjs on 2026-09-14 when that file crossed its 500-line cap —
// `code-style.md` §1 wants the extraction in the SAME commit as the growth, and the file-size
// ratchet from slice 1 of this same programme is what caught it.
//
// These cases share one property that makes them worth grouping: every one is UNREACHABLE from the
// repository root, which is the only place lefthook and CI ever invoke the guard. Five review
// rounds and four CR-local rounds passed over the fail-open they pin.

import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { run, seedFlagship, withRepo } from './check-retracted-phrase.testkit.mjs'

test('a near-identical sibling path is not mistaken for the edited file', () => {
  // MUTATION: compare paths loosely in survivors() — a normalised form, a `String.includes`, or
  // a basename match instead of exact equality → the sibling is dropped as "self", the only
  // survivor disappears, and the guard exits 0 on a live retraction (fail-OPEN). That is the
  // shape of the `./`-prefix hole already recorded against check-file-size-guard.mjs.
  //
  // This does NOT pin the latin1 decode, despite the byte-level fixture: Node's string path API
  // re-encodes these names to VALID UTF-8 on the way to the filesystem (0xFE becomes C3 BE), so
  // both decodes keep the two paths distinct and the mutation is unobservable here. See the
  // preamble, which lists that decode among the mechanisms it records as unpinned.
  withRepo((r) => {
    const odd = (b) =>
      Buffer.concat([Buffer.from('docs/we'), Buffer.from([b]), Buffer.from('rd.md')]).toString(
        'latin1',
      )
    const [a, b] = [odd(0xfe), odd(0xff)]
    for (const p of [a, b]) r.write(p, 'the count is 1807 here\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'two odd paths')
    r.write(a, 'the count is 1806 here\n')
    r.git('add', '-A')
    const { status, stderr } = run(r, 'fix: correct one of them\n')
    assert.equal(status, 1)
    assert.match(stderr, /retracted the value `1807`/)
  })
})

test('grades a path holding a non-UTF-8 byte', () => {
  // MUTATION: pass paths to git through argv rather than diffing blob SHAs → Node re-encodes
  // the argument as UTF-8, git is handed a name that matches nothing, and the file is never
  // graded while the guard still exits 0.
  withRepo((r) => {
    seedFlagship(r)
    const odd = Buffer.concat([Buffer.from('docs/we'), Buffer.from([0xff]), Buffer.from('ird.md')])
    const p = join(r.dir, odd.toString('latin1'))
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, 'the count is 1807 here\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'add odd path')
    writeFileSync(p, 'the count is 1806 here\n')
    r.git('add', '-A')
    const { status, stderr } = run(r, 'fix: correct the count\n')
    assert.equal(status, 1)
    assert.match(stderr, /retracted the value `1807`/)
  })
})

test('finds a survivor when invoked from a subdirectory, not just the repo root', () => {
  // MUTATION: drop `--full-name` from the SURVIVOR GREP → git spells its output relative to the
  // CWD, so from `docs/` it returns `../.claude/limits.json`. `inCorpus` rejects the `../`
  // prefix, every survivor is discarded, and the guard exits 0 having found nothing. Fail-OPEN.
  //
  // ONLY that flag. This comment previously also claimed `--full-tree` and `--no-relative`, and
  // both reviewers measured that neither reddens this test: `--full-tree` is reached only in
  // `--base` mode, and `--no-relative` only when `diff.relative` is set. Each has its own test
  // below. A MUTATION comment naming three mechanisms while pinning one is the §7 defect.
  //
  // Unreachable from the repo root, which is where lefthook and CI both run it — so every other
  // fixture in these suites passes with the flags removed. That is exactly why this one runs the
  // guard from a subdirectory instead.
  withRepo((r) => {
    seedFlagship(r)
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    // A real subdirectory to stand in. Its content is irrelevant; only the CWD matters.
    r.write('docs/anything.md', 'a file so the directory exists\n')
    r.git('add', '-A')
    const { status, stderr } = run(r, 'fix: correct the count\n', undefined, join(r.dir, 'docs'))
    assert.equal(status, 1, 'the guard must work the same from any directory in the repo')
    assert.match(stderr, /retracted the value `1807`/)
  })
})

test('a completed spec is still excluded when the guard runs from a subdirectory', () => {
  // MUTATION: drop `--full-name` from listTracked's ls-files branch → from a subdirectory git
  // returns `../.spec-workflow/specs/done/tasks.md`, the `slice(0, 3)` directory extraction
  // produces `../.spec-workflow/specs` instead of the spec dir, no `:(top,exclude)` pathspec is
  // built for it, and the completed spec counts as a live survivor. The commit-msg hook runs from
  // the repo root, so nothing else in these suites reaches this branch.
  withRepo((r) => {
    r.write('.claude/limits.json', '{ "note": "value 1807" }\n')
    r.write('.spec-workflow/specs/done/tasks.md', '- [x] finished\nthe value 1807 was used\n')
    r.write('docs/anything.md', 'a subdirectory to stand in\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('.claude/limits.json', '{ "note": "value 1806" }\n')
    r.git('add', '-A')
    assert.equal(
      run(r, 'fix: correct it\n', undefined, join(r.dir, 'docs')).status,
      0,
      'a completed spec must stay excluded from any working directory',
    )
  })
})

test('a global diff.relative does not hide changes from the guard', () => {
  // MUTATION: drop `--no-relative` from changedEntries → with `diff.relative=true` set (a real
  // and reasonably common global setting) `git diff --raw` run from a subdirectory OMITS every
  // change outside that directory. Not a misspelled path like the flags above: a silently
  // TRUNCATED changed-file list, so the corrected file never enters the candidate set at all and
  // the guard exits 0 having graded nothing.
  withRepo((r) => {
    seedFlagship(r)
    r.write('docs/anything.md', 'a subdirectory to stand in\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'add a subdirectory')
    r.git('config', 'diff.relative', 'true') // local config, same effect as a global one
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    r.git('add', '-A')
    const { status, stderr } = run(r, 'fix: correct the count\n', undefined, join(r.dir, 'docs'))
    assert.equal(status, 1, 'diff.relative must not hide the corrected file')
    assert.match(stderr, /retracted the value `1807`/)
  })
})
