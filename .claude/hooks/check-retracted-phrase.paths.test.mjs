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

// Raw 0xFE/0xFF bytes are legal in a POSIX filename and rejected by macOS and Windows, so this
// fixture can only exist on Linux — which is also the only platform CI runs it on. The sibling
// test below is deliberately NOT skipped: it uses a latin1 STRING path, which Node re-encodes to
// valid UTF-8, so it exercises argv re-encoding rather than a raw invalid byte and runs anywhere.
// GROUP: splitnul-decodes-utf8
test('a near-identical sibling path is not mistaken for the edited file', {
  skip: process.platform !== 'linux',
}, () => {
  // MUTATION: decode git's `-z` output as utf8 instead of latin1 in `splitNul` → both invalid
  // bytes collapse to the same U+FFFD string, the sibling is dropped as "self", the only survivor
  // disappears, and the guard exits 0 on a live retraction (fail-OPEN). Encoded as
  // `splitnul-decodes-utf8`; measured to redden exactly this test across all four suites.
  //
  // A LOOSE path comparison in survivors() does NOT pin this test: these two fixture paths differ
  // in their BASENAME, not their directory, so a basename match survives here. That break needs a
  // sibling differing by DIRECTORY, graded by the same-basename test at the foot of this file and
  // encoded as `survivors-self-compare-by-basename`.
  //
  // The decode was listed as unpinnable in this suite's preamble because the old fixture built the
  // names as latin1 STRINGS, and Node re-encodes a string path to UTF-8 on the way to the syscall
  // (0xFE became C3 BE), so the files never carried an invalid byte at all. A BUFFER path reaches
  // the syscall byte-for-byte. Decoded as utf8 both names collapse to the same U+FFFD string, the
  // sibling is dropped as "self", and the survivor vanishes.
  withRepo((r) => {
    const odd = (b) =>
      Buffer.concat([Buffer.from('docs/we'), Buffer.from([b]), Buffer.from('rd.md')])
    const abs = (rel) => Buffer.concat([Buffer.from(`${r.dir}/`), rel])
    mkdirSync(join(r.dir, 'docs'), { recursive: true })
    const [a, b] = [odd(0xfe), odd(0xff)]
    for (const rel of [a, b]) writeFileSync(abs(rel), 'the count is 1807 here\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'two odd paths')
    writeFileSync(abs(a), 'the count is 1806 here\n')
    r.git('add', '-A')
    const { status, stderr } = run(r, 'fix: correct one of them\n')
    assert.equal(status, 1)
    assert.match(stderr, /retracted the value `1807`/)
  })
})

// GROUP: hunksfor-paths-through-argv
test('grades a path whose name survives an argv round-trip', () => {
  // MUTATION: pass paths to git through argv rather than diffing blob SHAs → the guard decodes
  // git's output as latin1, an argv round-trip then re-encodes it (U+00FF becomes C3 83 C2 BF),
  // git is handed a name matching nothing, and the file is never graded while the guard exits 0.
  //
  // The name says "argv round-trip" and not "non-UTF-8 byte" deliberately: `toString('latin1')`
  // makes a STRING, and Node writes U+00FF as the valid UTF-8 pair C3 BF, so this fixture holds
  // no invalid byte. The raw-byte case is the Buffer-path test above.
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

// GROUP: survivors-drop-full-name
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

// GROUP: lsfiles-drop-full-name
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

// GROUP: changedentries-drop-no-relative
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

// GROUP: survivors-self-compare-by-basename
test('a sibling in a different directory with the same filename is not dropped as self', () => {
  // MUTATION: change `p !== self` in survivors() to a basename comparison
  // (e.g. `path.split('/').pop() !== self.split('/').pop()`) → the sibling shares the basename,
  // is dropped as "self", no survivors remain, and the guard exits 0 on a live retraction
  // (fail-OPEN). The existing odd-byte fixture does NOT pin this because its two paths differ
  // in their BASENAME (0xFE vs 0xFF); reaching this break needs paths that share a basename
  // but sit in different directories.
  withRepo((r) => {
    // Two files under docs/ with the SAME filename in different subdirectories.
    // Both are in the corpus (docs/ prefix match). Both hold the old value.
    r.write('docs/folder-a/metrics.md', '{ "note": "count is 1807 here" }\n')
    r.write('docs/folder-b/metrics.md', '{ "note": "count is 1807 here" }\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init two sibling files')
    // Correct only the first one; the second remains as a survivor.
    r.write('docs/folder-a/metrics.md', '{ "note": "count is 1806 here" }\n')
    r.git('add', '-A')
    const { status, stderr } = run(r, 'fix: correct the count\n')
    assert.equal(status, 1, 'the sibling in docs/folder-b/ must be found as a survivor')
    assert.match(stderr, /retracted the value `1807`/)
  })
})
