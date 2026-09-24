// Run: node --test .claude/hooks/check-decisions-ledger.range-hint.test.mjs
//
// The [range] finding's HINT TEXT: names a merge as the fix only when a merge actually wrote the
// flagged line, via a blame walk (buildMergeWalker/offenderKey) — never from text equality alone.
// Other range-unit behavior: check-decisions-ledger.range.test.mjs. Fixtures:
// check-decisions-ledger.testkit.mjs.
//
// Every case is MUTATION-PINNED (code-style.md §7); the exact set each break reddens is DATA
// in check-decisions-ledger.mutations.json, re-derived by
// `node .claude/hooks/run-mutations.mjs --guard check-decisions-ledger`.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  commit,
  E16_MASTER,
  forked,
  ledger,
  ledgerNo14,
  mergeMaster,
  readme,
  runBase,
  startWork,
  waive,
  withRepo,
} from './check-decisions-ledger.testkit.mjs'

// GROUP: range-hint-generic
test('a range finding tells the author a merge cannot waive it', () =>
  withRepo((r) => {
    // MUTATION: print the per-commit hint for range findings → the author is told to add a
    // trailer to the merge commit, which is never read.
    forked(r, () => readme(r))
    mergeMaster(r, ledger('EDITED IN MERGE.', undefined, [E16_MASTER]))
    const res = runBase(r, 'master')
    assert.match(
      res.stderr,
      /a merge cannot waive: restore this line in a commit with Ledger-edit-ok: 14, or redo the merge/,
    )
  }))

// GROUP: range-hint-merges-ignored, walk-stops-at-first-parent-only, walker-any-merge
test('a range finding on a branch with no merge names the non-merge remedy', () =>
  withRepo((r) => {
    startWork(r)
    commit(r, ledgerNo14(), waive(14, 'fix: remove decision 14'))
    // MUTATION: give every range finding the merge hint → a merge-free branch is told to redo a
    // merge it does not have.
    // MUTATION: only ever check the merge's mainline (first) parent → the match on the second
    // (work) parent is missed, no parent appears to match, and the merge itself is blamed.
    commit(r, ledger('NEVER REVIEWED.'), 're-add 14')
    r.git('checkout', '-qb', 'pr-merge', 'master')
    r.git('merge', '-q', '--no-ff', '-m', 'Merge work into master', 'work')
    const res = runBase(r, 'master')
    assert.match(res.stderr, /\[range\][\s\S]*add Ledger-edit-ok: 14 to the non-merge commit/)
    assert.doesNotMatch(res.stderr, /redo the merge/)
  }))

// GROUP: walk-uses-raw-text
test('a merge that wrote the body is still blamed after a later commit appends a marker', () =>
  withRepo((r) => {
    // MUTATION: walk the raw slot text instead of the marker-stripped body → the marker-append
    // commit's text no longer matches the merge's, and the walk stops there instead of at the merge.
    forked(r, () => readme(r))
    mergeMaster(r, ledger('EDITED IN MERGE.', undefined, [E16_MASTER]))
    commit(
      r,
      ledger('EDITED IN MERGE. Superseded by 16.', undefined, [E16_MASTER]),
      'feat: 16 supersedes 14',
    )
    const res = runBase(r, 'master')
    assert.match(res.stderr, /\[range\][\s\S]*## 14[\s\S]*redo the merge/)
  }))

// GROUP: range-hint-merges-ignored, walker-any-merge
test('a range finding names the non-merge remedy when a merge wrote only an earlier text', () =>
  withRepo((r) => {
    forked(r, () => readme(r))
    mergeMaster(r, ledger('EDITED IN MERGE.', undefined, [E16_MASTER]))
    commit(r, ledgerNo14([E16_MASTER]), waive(14, 'fix: remove decision 14'))
    // MUTATION: blame a merge whose text is not the final commit's own — the removal commit
    // breaks the chain, so the re-add (not the merge) wrote HEAD's line even though the words match.
    commit(r, ledger('EDITED IN MERGE.', undefined, [E16_MASTER]), 're-add 14')
    const res = runBase(r, 'master')
    assert.match(res.stderr, /\[range\][\s\S]*## 14[\s\S]*to the non-merge commit that made/)
    assert.doesNotMatch(res.stderr, /redo the merge/)
  }))

// GROUP: range-repeats-commit-findings, dedup-raw-key
test('a per-commit body finding is not repeated under range after a later marker append', () =>
  withRepo((r) => {
    // MUTATION: dedup on the raw slot text instead of the body alone → the marker-append commit's
    // text differs from what was reported, so the same body edit prints again under [range].
    startWork(r)
    commit(r, ledger('EDITED.'), 'edit 14')
    commit(
      r,
      ledger('EDITED. Amended by 16.', undefined, ['## 16 — 2026-03-12 — amends 14.']),
      'feat: 16 amends 14',
    )
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.equal(res.stderr.match(/## 14 — body edited/g)?.length, 1)
    assert.doesNotMatch(res.stderr, /\[range\]/)
  }))

// GROUP: walk-marker-key-uses-body
test('a merge dropping a base marker is blamed even after a later commit appends a different one', () =>
  withRepo((r) => {
    const base = ledger('first decision. Superseded by 15.')
    const master = ledger('first decision. Superseded by 15.', undefined, [E16_MASTER])
    forked(r, () => readme(r), { base, master })
    mergeMaster(r, ledger('first decision.', undefined, [E16_MASTER]))
    // MUTATION: walk the entry body instead of the still-present base-marker subset → the marker
    // drop never moves the key, so nothing distinguishes the merge from any other commit.
    commit(
      r,
      ledger('first decision. Amended by 20.', undefined, [E16_MASTER]),
      'feat: 20 amends 14',
    )
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /\[range\][\s\S]*## 14[\s\S]*redo the merge/)
  }))

// GROUP: range-repeats-commit-findings
test('two separate unwaived marker drops on the same token are each reported once', () =>
  withRepo((r) => {
    const base = ledger('first decision. Superseded by 20. Amended by 21.')
    startWork(r, base)
    commit(r, ledger('first decision. Amended by 21.'), 'drop Superseded marker')
    commit(r, ledger('first decision.'), 'drop Amended marker')
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.equal(res.stderr.match(/lost marker\(s\): Superseded 20/g)?.length, 1)
    assert.equal(res.stderr.match(/lost marker\(s\): Amended 21/g)?.length, 1)
  }))
