// Run: node --test .claude/hooks/check-retracted-phrase.base.test.mjs
//
// `--base` (CI) mode: the branch-range path. Split out of check-retracted-phrase.repo.test.mjs
// on 2026-09-14 when that file reached 493 of its 500-line cap and these cases could not be
// added without it — `code-style.md` §1 requires the extraction in the SAME commit as the growth.
//
// This mode is where the guard and its commit-msg counterpart can DIVERGE, so the cases here are
// mostly about the two agreeing: the same waiver, the same corpus, the same answer.
//
// Same MUTATION-PINNED discipline as its sibling; the deliberately-unpinned mechanisms are
// listed in that file's preamble and are not repeated here.

import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { run, seedFlagship, withRepo } from './check-retracted-phrase.testkit.mjs'

// GROUP: base-message-blanked
test('--base mode honours a waiver written in the commit that needed it', () => {
  // MUTATION: stop passing each commit's own message into checkCommit in --base mode (leave it
  // '') → a commit legitimately waived at commit-msg re-fires in CI with no waiver reachable, and
  // the required check is blocked permanently. Its only remedies would be deleting correct corpus
  // text or disabling the step, which is how a gate gets switched off for good.
  withRepo((r) => {
    seedFlagship(r) // already commits
    const base = r.git('rev-parse', 'HEAD').trim()
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    r.git('add', '-A')
    r.git(
      'commit',
      '-qm',
      'fix: correct the count\n\nRetracted-ok: 1807 — the guard fixture pins the pre-fix value on purpose',
    )
    assert.equal(run(r, null, ['--base', base]).status, 0)
  })
})

// GROUP: base-waivers-shared-across-range
test("--base mode does not let one commit's waiver clear another commit's finding", () => {
  // MUTATION: concatenate every range commit's message into ONE waiver map (the obvious way to
  // implement --base waivers) → the waiver below, written for a DIFFERENT file's retraction,
  // silently clears an unrelated finding carrying the same token. parseWaivers keys on the token
  // alone, so the hatch would widen from "this commit, this token" to "anywhere in the range".
  withRepo((r) => {
    r.write('.claude/limits.json', '{ "note": "value 1807 here" }\n')
    r.write('docs/a.md', 'the value 1807 also appears here\n')
    r.write('docs/b.md', 'and the value 1807 appears here too\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'base')
    const base = r.git('rev-parse', 'HEAD').trim()

    // Commit 1 retracts 1807 from limits.json and waives it, naming its own reason.
    r.write('.claude/limits.json', '{ "note": "value 1806 here" }\n')
    r.git('add', '-A')
    r.git(
      'commit',
      '-qm',
      'fix: correct limits\n\nRetracted-ok: 1807 — limits.json is the canonical source and the docs quote it deliberately',
    )

    // Commit 2 retracts the SAME token from a different file and waives NOTHING.
    r.write('docs/a.md', 'the value 1806 also appears here\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'fix: correct docs/a.md with no waiver')

    const { status, stderr } = run(r, null, ['--base', base])
    assert.equal(status, 1, "commit 2's finding must survive commit 1's waiver")
    assert.match(stderr, /docs\/a\.md/)
  })
})

// GROUP: base-grepscope-always-cached
test('an intermediate commit is graded against its OWN tree, not HEAD', () => {
  // MUTATION: make grepScope always return ['--cached'] → every commit in the range is graded
  // against HEAD instead of its own tree. Invisible in a single-commit range, because there the
  // last commit IS HEAD; it only bites on an INTERMEDIATE commit whose survivor a LATER commit
  // has already cleaned up. The guard then reports no survivor for a commit that genuinely had
  // one, and CI passes a retraction that was incomplete when it was made (fail-OPEN).
  withRepo((r) => {
    r.write('docs/a.md', 'the generated file is 1807 lines\n')
    r.write('docs/b.md', 'and elsewhere: 1807 lines again\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    const base = r.git('rev-parse', 'HEAD').trim()

    // Commit 1 retracts the token from a.md while b.md still carries it — incomplete, no waiver.
    r.write('docs/a.md', 'the generated file is 1806 lines\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'fix: correct a.md only')

    // Commit 2 tidies b.md, so at HEAD the survivor is gone.
    r.write('docs/b.md', 'and elsewhere: 1806 lines again\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'chore: tidy b.md')

    const { status, stderr } = run(r, null, ['--base', base])
    assert.equal(status, 1, "commit 1's incomplete retraction must still be reported")
    assert.match(stderr, /retracted the value `1807`/)
  })
})

// GROUP: base-lstree-literal-glob
test('a completed spec stays excluded in --base mode, exactly as at commit-msg', () => {
  // MUTATION: pass a `*/tasks.md` glob to listTracked's ls-tree branch → `git ls-tree` matches the
  // `*` LITERALLY and returns nothing, so completedSpecDirs() yields [] and no spec is ever
  // excluded in CI. That is a DIVERGENCE bug rather than a fail-open: the commit passes the
  // commit-msg hook, where ls-files does expand the glob, and then fails CI on a token surviving
  // only in a historical record. Verified: ls-tree 0 hits vs ls-files 19 on the same pathspec.
  withRepo((r) => {
    r.write('.claude/limits.json', '{ "note": "value 1807" }\n')
    r.write('.spec-workflow/specs/done/tasks.md', '- [x] finished\nthe value 1807 was used\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    const base = r.git('rev-parse', 'HEAD').trim()

    r.write('.claude/limits.json', '{ "note": "value 1806" }\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'fix: correct the value')

    assert.equal(
      run(r, null, ['--base', base]).status,
      0,
      'a completed spec must not count as a survivor in --base mode either',
    )
  })
})

// GROUP: base-rev-list-keeps-merges
test('a merge commit in the range does not swallow the waivers below it', () => {
  // MUTATION: drop `--no-merges` from the rev-list enumeration → the merge enters the range as a
  // unit whose diff is EVERY commit it brings in and whose message is an auto-generated
  // "Merge ..." with no `Retracted-ok:` trailer. Every waiver written on the branch becomes
  // unreachable and the required check blocks with no remedy.
  //
  // The fixture mirrors CI's actual shape and the direction matters: on a `pull_request` event
  // `actions/checkout` checks out `refs/pull/N/merge`, whose FIRST parent is the base tip, so the
  // merge's own diff is the whole PR. Merging the other way round — feature into the branch you
  // are already on — makes the merge diff exclude the retraction, and the test then passes with
  // `--no-merges` removed. It did, on the first attempt.
  withRepo((r) => {
    r.write('.claude/limits.json', '{ "note": "types.ts is GENERATED (1807 lines)" }\n')
    r.write('docs/sibling.md', 'the generated file is 1807 lines\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    const base = r.git('rev-parse', 'HEAD').trim()
    const trunk = r.git('rev-parse', '--abbrev-ref', 'HEAD').trim()

    // The PR branch: an incomplete retraction, waived deliberately by its author.
    r.git('checkout', '-q', '-b', 'pr')
    r.write('.claude/limits.json', '{ "note": "types.ts is GENERATED (1806 lines)" }\n')
    r.git('add', '-A')
    r.git(
      'commit',
      '-qm',
      'fix: correct the count\n\nRetracted-ok: 1807 — docs/sibling.md quotes the pre-fix value on purpose',
    )

    // The merge ref CI stands on: base FIRST, PR second.
    r.git('checkout', '-q', trunk)
    r.git('merge', '--no-ff', '-q', '-m', 'Merge pr into trunk', 'pr')

    assert.equal(
      run(r, null, ['--base', base]).status,
      0,
      'the waiver inside the PR must still be reachable under the merge ref',
    )
  })
})

// GROUP: base-lstree-drop-full-tree
test('--base mode excludes a completed spec from a subdirectory too', () => {
  // MUTATION: drop `--full-tree` from listTracked's ls-tree branch → from a subdirectory the
  // listing comes back empty, `completedSpecDirs` returns [], no spec is excluded, and the
  // completed spec's copy of the value counts as a survivor. Only `--base` mode reaches ls-tree,
  // and only a subdirectory reaches the CWD-relative behaviour, so this is the single fixture
  // that touches both at once.
  withRepo((r) => {
    r.write('.claude/limits.json', '{ "note": "value 1807" }\n')
    r.write('.spec-workflow/specs/done/tasks.md', '- [x] finished\nthe value 1807 was used\n')
    r.write('docs/anything.md', 'a subdirectory to stand in\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    const base = r.git('rev-parse', 'HEAD').trim()
    r.write('.claude/limits.json', '{ "note": "value 1806" }\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'fix: correct the value')
    assert.equal(
      run(r, null, ['--base', base], join(r.dir, 'docs')).status,
      0,
      'a completed spec must stay excluded in --base mode from any directory',
    )
  })
})

// GROUP: completedspecdirs-drop-full-name
test('a LIVE spec still counts as a survivor when run from a subdirectory', () => {
  // MUTATION: drop `--full-name` from the grep inside completedSpecDirs → the `- [ ]` search
  // returns `../.spec-workflow/...`, so no directory matches and EVERY spec looks completed.
  // All of them are then excluded from the corpus and a survivor living in a LIVE spec is never
  // counted — a fail-OPEN produced by over-exclusion rather than under-matching, which is why
  // the completed-spec fixtures above cannot catch it.
  withRepo((r) => {
    r.write('.claude/limits.json', '{ "note": "value 1807" }\n')
    r.write('.spec-workflow/specs/live/tasks.md', '- [ ] still open\nthe value 1807 is used here\n')
    r.write('docs/anything.md', 'a subdirectory to stand in\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('.claude/limits.json', '{ "note": "value 1806" }\n')
    r.git('add', '-A')
    const { status, stderr } = run(r, 'fix: correct it\n', undefined, join(r.dir, 'docs'))
    assert.equal(status, 1, 'a live spec is part of the corpus from any directory')
    assert.match(stderr, /retracted the value `1807`/)
  })
})
