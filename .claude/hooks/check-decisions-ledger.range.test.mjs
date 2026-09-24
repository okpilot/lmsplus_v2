// Run: node --test .claude/hooks/check-decisions-ledger.range.test.mjs
//
// The --base RANGE unit of the decisions-ledger guard (#1350), spawned: an edit made only in a
// merge commit, and the exact-text binding of a waiver. Pure slotText/checkRange cases:
// check-decisions-ledger.range-pure.test.mjs. The range finding's HINT TEXT (merge vs non-merge
// remedy): check-decisions-ledger.range-hint.test.mjs. Fixtures: check-decisions-ledger.testkit.mjs.
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
  LEDGER_V1,
  ledger,
  ledgerNo14,
  mergeMaster,
  readme,
  runBase,
  startWork,
  waive,
  withRepo,
} from './check-decisions-ledger.testkit.mjs'

// CONTROL: red
// GROUP: check-decisions-ledger-always-passes, range-unit-dropped
test('--base blocks an edit to an existing line made only in a merge commit', () =>
  withRepo((r) => {
    // MUTATION: drop the range unit → merges are never graded and this passes.
    forked(r, () => readme(r))
    mergeMaster(r, ledger('EDITED IN MERGE.', undefined, [E16_MASTER]))
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /\[range\][\s\S]*## 14 — body edited/)
  }))

// GROUP: range-repeats-commit-findings
test('an unwaived edit on a branch with no merge is reported once, with the trailer hint', () =>
  withRepo((r) => {
    // MUTATION: drop the per-commit dedup → the same edit is reported again under [range].
    startWork(r)
    commit(r, ledger('EDITED.'), 'edit 14')
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /→ add to the commit message: Ledger-edit-ok: 14/)
    assert.equal(res.stderr.match(/## 14 — body edited/g)?.length, 1)
  }))

// GROUP: range-dedup-token-only
test('a merge re-editing a line a commit already broke is still reported as a merge edit', () =>
  withRepo((r) => {
    // MUTATION: skip every range finding whose token a commit reported → the merge's own edit C
    // is hidden until the author fixes B.
    forked(r, () => commit(r, ledger('B.'), 'edit 14'))
    mergeMaster(r, ledger('C.', undefined, [E16_MASTER]))
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /\[range\][\s\S]*a merge cannot waive/)
  }))

// GROUP: range-rebind-unchanged-slot
test('a ledger-neutral commit after a merge edit does not re-bind a waiver to the merge text', () =>
  withRepo((r) => {
    // MUTATION: re-bind without checking the commit's OLD slot matched the authorized text → the
    // README commit moves the waiver for A to the merge's text X and the merge-only edit clears.
    forked(r, () => commit(r, ledger('A.'), waive(14, 'fix: reword 14')))
    mergeMaster(r, ledger('X.', undefined, [E16_MASTER]))
    readme(r)
    assert.equal(runBase(r, 'master').status, 1)
  }))

// GROUP: range-rebind-unchanged-slot
test('a marker appended after a merge edit does not adopt the merge text', () =>
  withRepo((r) => {
    // MUTATION: re-bind without checking the commit's OLD slot matched the authorized text → the
    // marker commit moves the waiver for A onto the merge's X and the merge-only edit clears.
    forked(r, () => commit(r, ledger('A.'), waive(14, 'fix: reword 14')))
    mergeMaster(r, ledger('X.', undefined, [E16_MASTER]))
    commit(r, ledger('X. Amended by 16.', undefined, [E16_MASTER]), 'feat: 16 amends 14')
    assert.equal(runBase(r, 'master').status, 1)
  }))

// GROUP: range-authorization-token-only
test('a waived edit re-edited by a merge is blocked', () =>
  withRepo((r) => {
    forked(r, () => commit(r, ledger('EDITED.'), waive(14, 'fix: reword 14')))
    mergeMaster(r, ledger('EDITED AGAIN IN MERGE.', undefined, [E16_MASTER]))
    assert.equal(runBase(r, 'master').status, 1)
  }))

// GROUP: range-authorization-not-invalidated
test('a merge reinstating a superseded waived text is blocked', () =>
  withRepo((r) => {
    // MUTATION: never drop an ancestor's authorization → the superseded waived text A clears.
    forked(r, () => {
      commit(r, ledger('A.'), waive(14, 'fix: reword 14'))
      commit(r, ledger('B.'), waive(14, 'fix: correct the reword of 14'))
    })
    mergeMaster(r, ledger('A.', undefined, [E16_MASTER]))
    assert.equal(runBase(r, 'master').status, 1)
  }))

// GROUP: range-unit-dropped
test('a waiver for one line does not clear a merge edit to another', () =>
  withRepo((r) => {
    forked(r, () => commit(r, ledger('EDITED.'), waive(14, 'fix: reword 14')))
    mergeMaster(r, ledger('EDITED.', 'EDITED IN MERGE.', [E16_MASTER]))
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /## 15 — body edited/)
  }))

// CONTROL: green
// GROUP: check-decisions-ledger-always-blocks
test('a branch merging master that carries a waived master edit passes', () =>
  withRepo((r) => {
    startWork(r)
    readme(r)
    r.git('checkout', '-q', 'master')
    commit(r, ledger('EDITED ON MASTER.'), waive(14, 'fix: reword 14'))
    r.git('checkout', '-q', 'work')
    r.git('merge', '-q', '--no-ff', '-m', 'Merge master', 'master')
    assert.equal(runBase(r, 'master').status, 0)
  }))

// GROUP: range-authorizations-not-recorded
test('a stale base passes when the branch merged a newer master carrying a waived edit', () =>
  withRepo((r) => {
    // MUTATION: stop recording authorizations → the master-side waived commit is in the
    // range, its edit reaches HEAD through the merge, and the range unit blocks it.
    startWork(r)
    r.git('tag', 'stale', 'master')
    readme(r)
    r.git('checkout', '-q', 'master')
    commit(r, ledger('EDITED ON MASTER.'), waive(14, 'fix: reword 14'))
    r.git('checkout', '-q', 'work')
    r.git('merge', '-q', '--no-ff', '-m', 'Merge master', 'master')
    assert.equal(runBase(r, 'stale').status, 0)
  }))

test('renumbering a branch-only line while merging master passes', () =>
  withRepo((r) => {
    const mine = '## 16 — 2026-03-12 — a branch decision.'
    forked(r, () => commit(r, ledger(undefined, undefined, [mine]), 'add branch decision'))
    const renumbered = '## 17 — 2026-03-12 — a branch decision.'
    mergeMaster(r, ledger(undefined, undefined, [E16_MASTER, renumbered]))
    assert.equal(runBase(r, 'master').status, 0)
  }))

test('restoring the line in a waived follow-up commit clears a merge edit', () =>
  withRepo((r) => {
    forked(r, () => readme(r))
    mergeMaster(r, ledger('EDITED IN MERGE.', undefined, [E16_MASTER]))
    commit(r, ledger(undefined, undefined, [E16_MASTER]), waive(14, 'fix: restore 14'))
    assert.equal(runBase(r, 'master').status, 0)
  }))

// GROUP: range-unit-dropped
test('--base blocks a header edit made only in a merge commit', () =>
  withRepo((r) => {
    forked(r, () => readme(r))
    const editedHeader = ledger(undefined, undefined, [E16_MASTER]).replace(
      '> rule text',
      '> EDITED rule text',
    )
    mergeMaster(r, editedHeader)
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /\[range\][\s\S]*header changed/)
  }))

// GROUP: range-header-slot-dropped
test('a waived header edit does not clear a merge that rewrites the header again', () =>
  withRepo((r) => {
    // MUTATION: drop the header branch of slotText → the waiver binds to null, matches any
    // header, and the merge's own header rewrite clears.
    const header = (text, extra) =>
      ledger(undefined, undefined, extra).replace('> rule text', `> ${text}`)
    forked(r, () => commit(r, header('BRANCH rule text', []), waive('header', 'fix: header')))
    mergeMaster(r, header('MERGE rule text', [E16_MASTER]))
    assert.equal(runBase(r, 'master').status, 1)
  }))

// GROUP: range-unit-dropped
test('--base blocks a merge that deletes docs/decisions.md entirely', () =>
  withRepo((r) => {
    forked(r, () => readme(r))
    try {
      r.git('merge', '-q', '--no-ff', '--no-commit', 'master')
    } catch {
      // A ledger conflict is expected here; the rm below resolves it.
    }
    r.git('rm', '-qf', 'docs/decisions.md')
    r.git('commit', '-qm', 'Merge branch master into work')
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /\[range\][\s\S]*docs\/decisions\.md deleted/)
  }))

test('--base catches a malformed line introduced only by a merge resolution', () =>
  withRepo((r) => {
    forked(r, () => readme(r))
    mergeMaster(r, ledger(undefined, undefined, [E16_MASTER, '## 17 2026-03-12 broken']))
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /\[range\][\s\S]*malformed entry line/)
  }))

// GROUP: range-authorization-not-invalidated
test('a merge re-deleting an entry the branch removed and then restored is blocked', () =>
  withRepo((r) => {
    forked(r, () => {
      commit(r, ledgerNo14(), waive(14, 'fix: remove duplicate decision 14 temporarily'))
      commit(r, LEDGER_V1, 'restore decision 14 unchanged')
    })
    // MUTATION: never drop an ancestor's authorization → the stale ABSENT waiver clears it.
    mergeMaster(r, ledgerNo14([E16_MASTER]))
    assert.equal(runBase(r, 'master').status, 1)
  }))

// GROUP: range-removal-auth-rebinds
test('an unwaived re-add of a line a waiver removed is blocked', () =>
  withRepo((r) => {
    startWork(r)
    commit(r, ledgerNo14(), waive(14, 'fix: remove decision 14'))
    // MUTATION: re-bind a removal authorization to the re-added text → the new body clears.
    commit(r, ledger('NEVER REVIEWED.'), 're-add 14')
    assert.equal(runBase(r, 'master').status, 1)
  }))

// GROUP: range-readd-waiver-dropped
test('a waived re-add of a line a waiver removed passes', () =>
  withRepo((r) => {
    startWork(r)
    commit(r, ledgerNo14(), waive(14, 'fix: remove decision 14'))
    // MUTATION: record only waivers a per-commit finding used → the re-add's waiver, which no
    // per-commit finding needs, authorizes nothing and the range unit blocks.
    commit(r, ledger('REVIEWED WORDING.'), waive(14, 'fix: re-add 14 reworded'))
    assert.equal(runBase(r, 'master').status, 0)
  }))

// GROUP: range-rebind-marker-superset-dropped
test('a later commit marking a text a merge stripped of a base marker is blocked', () =>
  withRepo((r) => {
    const base = ledger('first decision. Amended by 15.')
    const master = ledger('first decision. Amended by 15.', undefined, [E16_MASTER])
    forked(r, () => commit(r, ledger('EDITED. Amended by 15.'), waive(14, 'fix: reword 14')), {
      base,
      master,
    })
    mergeMaster(r, ledger('EDITED.', undefined, [E16_MASTER]))
    // MUTATION: re-bind on the body alone → the waiver follows the stripped text into the
    // marked one, and the base marker the merge dropped clears.
    commit(r, ledger('EDITED. Amended by 16.', undefined, [E16_MASTER]), 'mark 14')
    assert.equal(runBase(r, 'master').status, 1)
  }))

// GROUP: range-authorization-not-invalidated, range-marker-superset-dropped
test('a merge dropping a marker the branch removed and then restored is blocked', () =>
  withRepo((r) => {
    // MUTATION: keep the waived marker-less text after a later commit restores the marker → the
    // merge re-dropping it matches that stale authorization and passes.
    // MUTATION: match on the body alone → the re-bound marked text matches the unmarked merge.
    const marked = ledger('first decision. Amended by 15.')
    const master = ledger('first decision. Amended by 15.', undefined, [E16_MASTER])
    forked(
      r,
      () => {
        commit(r, ledger(), waive('14', 'drop marker'))
        commit(r, marked, 'restore marker')
      },
      { base: marked, master },
    )
    mergeMaster(r, ledger(undefined, undefined, [E16_MASTER]))
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /\[range\][\s\S]*## 14 — lost marker/)
  }))

// GROUP: range-gradeformat-last-unit
test('a numbering break made in a merge blocks even when a later commit leaves the ledger alone', () =>
  withRepo((r) => {
    // MUTATION: track the last unit instead of the last unit that CHANGED the ledger → the
    // trailing README commit's NEW equals HEAD and F1/F2 are skipped.
    forked(r, () => readme(r))
    mergeMaster(r, ledger(undefined, undefined, [E16_MASTER, '## 16 — 2026-03-12 — a duplicate.']))
    readme(r, 'after the merge\n')
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /\[range\][\s\S]*## 16 follows ## 16/)
  }))

test('a waived edit that later gains an appended marker passes on a linear branch', () =>
  withRepo((r) => {
    startWork(r)
    commit(r, ledger('EDITED.'), waive(14, 'fix: reword 14'))
    commit(
      r,
      ledger('EDITED. Amended by 16.', undefined, ['## 16 — 2026-03-12 — amends 14.']),
      'feat: decision 16 amends 14',
    )
    assert.equal(runBase(r, 'master').status, 0)
  }))

// GROUP: range-marker-exact-match
test('a waived edit that a merge later marks passes', () =>
  withRepo((r) => {
    // MUTATION: compare the whole raw line instead of body + marker superset → the marker the
    // merge appended no longer matches the waived text and the range unit blocks.
    const e16 = '## 16 — 2026-03-12 — amends 14.'
    const master = ledger('first decision. Amended by 16.', undefined, [e16])
    forked(r, () => commit(r, ledger('EDITED.'), waive(14, 'fix: reword 14')), { master })
    mergeMaster(r, ledger('EDITED. Amended by 16.', undefined, [e16]))
    assert.equal(runBase(r, 'master').status, 0)
  }))

// GROUP: range-branch-marker-required
test('a merge dropping a marker the branch added after a waived edit passes', () =>
  withRepo((r) => {
    // MUTATION: require every re-bound marker at HEAD → the branch-added marker the merge left
    // out no longer matches and the range unit blocks.
    forked(r, () => {
      commit(r, ledger('EDITED.'), waive(14, 'fix: reword 14'))
      commit(r, ledger('EDITED. Amended by 15.'), 'mark 14')
    })
    mergeMaster(r, ledger('EDITED.', undefined, [E16_MASTER]))
    assert.equal(runBase(r, 'master').status, 0)
  }))

test('concurrent waived edits on both sides let the merge keep either one', () =>
  withRepo((r) => {
    startWork(r)
    r.git('tag', 'stale', 'master')
    commit(r, ledger('BRANCH WORDING.'), waive(14, 'fix: reword 14 on the branch'))
    r.git('checkout', '-q', 'master')
    commit(r, ledger('MASTER WORDING.'), waive(14, 'fix: reword 14 on master'))
    r.git('checkout', '-q', 'work')
    mergeMaster(r, ledger('BRANCH WORDING.'))
    assert.equal(runBase(r, 'stale').status, 0)
  }))

// GROUP: range-rebind-ignores-ancestry
test('a master re-edit of a text the branch also waived keeps the branch waiver', () =>
  withRepo((r) => {
    // MUTATION: re-bind regardless of ancestry → the master commit rewording A to B moves the
    // branch's waiver for A to B, and the merge keeping the branch's A blocks.
    startWork(r)
    r.git('tag', 'stale', 'master')
    commit(r, ledger('A.'), waive(14, 'fix: reword 14 on the branch'))
    r.git('checkout', '-q', 'master')
    commit(r, ledger('A.'), waive(14, 'fix: reword 14 on master'))
    commit(r, ledger('B.'), waive(14, 'fix: reword 14 again on master'))
    r.git('checkout', '-q', 'work')
    mergeMaster(r, ledger('A.'))
    assert.equal(runBase(r, 'stale').status, 0)
  }))

// GROUP: range-ledgerless-waiver-recorded
test('a waiver on a commit with no ledger does not clear a merge dropping the last entry', () =>
  withRepo((r) => {
    // MUTATION: record waivers from a unit whose NEW has no ledger → its Ledger-edit-ok: 16
    // becomes an ABSENT authorization and clears the merge-only removal of ## 16.
    startWork(r, ledger(undefined, undefined, [E16_MASTER]))
    r.git('checkout', '-q', '--orphan', 'other')
    r.git('rm', '-rqf', '.')
    r.write('README.md', 'unrelated history\n')
    r.git('add', '-A')
    r.git('commit', '-qm', waive(16, 'chore: unrelated history'))
    r.git('checkout', '-q', 'work')
    r.git('merge', '-q', '--no-ff', '--no-commit', '--allow-unrelated-histories', 'other')
    commit(r, ledger(), 'Merge unrelated history')
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /\[range\][\s\S]*## 16 — line removed entirely/)
  }))

// GROUP: range-units-not-topo-ordered, range-rebind-unchanged-slot
test('a superseded waiver stays revoked when commit dates put the ancestor last', () =>
  withRepo((r) => {
    // MUTATION: drop --topo-order → A is also reachable through side commit C, dated after B, so
    // date order visits B before its ancestor A; A's authorization is added after B revoked it,
    // and the merge reinstating A clears.
    const dated = (date, text, message) => {
      r.write(text === null ? 'README.md' : 'docs/decisions.md', text ?? `${date}\n`)
      r.git('add', '-A')
      r.gitAt(date, 'commit', '-qm', message)
    }
    forked(r, () => {
      dated('2030-01-03T00:00:00Z', ledger('A.'), waive(14, 'fix: reword 14'))
      r.git('branch', 'side')
      dated('2030-01-01T00:00:00Z', ledger('B.'), waive(14, 'fix: reword 14 again'))
      r.git('checkout', '-q', 'side')
      dated('2030-01-02T00:00:00Z', null, 'side work')
      r.git('checkout', '-q', 'work')
      r.gitAt('2030-01-04T00:00:00Z', 'merge', '-q', '--no-ff', '-m', 'Merge side', 'side')
    })
    mergeMaster(r, ledger('A.', undefined, [E16_MASTER]))
    assert.equal(runBase(r, 'master').status, 1)
  }))
