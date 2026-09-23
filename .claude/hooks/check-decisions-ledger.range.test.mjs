// Run: node --test .claude/hooks/check-decisions-ledger.range.test.mjs
//
// The --base RANGE unit of the decisions-ledger guard (#1350): an edit made only in a merge
// commit, and the exact-text binding of a waiver. Pure checkRange/slotText cases first, then
// spawned repros. Fixtures: check-decisions-ledger.testkit.mjs.
//
// Every case is MUTATION-PINNED (code-style.md §7); the exact set each break reddens is DATA
// in check-decisions-ledger.mutations.json, re-derived by
// `node .claude/hooks/run-mutations.mjs --guard check-decisions-ledger`.

import assert from 'node:assert/strict'
import test from 'node:test'
import { checkRange, slotText } from './check-decisions-ledger.mjs'
import { GOOD_REASON, GUARD, LEDGER_V1, withRepo } from './check-decisions-ledger.testkit.mjs'
import { runNode } from './spawn.testkit.mjs'

/** A ledger with decision 14/15 bodies and any extra entry lines. */
function ledger(e14 = 'first decision.', e15 = 'second decision.', extra = []) {
  const lines = [`## 14 — 2026-03-11 — ${e14}`, `## 15 — 2026-03-11 — ${e15}`, ...extra]
  return `# Decisions\n\n> rule text\n\n${lines.join('\n')}\n`
}

const E16_MASTER = '## 16 — 2026-03-12 — a master decision.'

// ---------------------------------------------------------------- pure: slotText / checkRange

test('slotText returns the header, an entry line, or null for an absent entry', () => {
  assert.equal(slotText(LEDGER_V1, 'header'), '# Decisions\n\n> rule text\n')
  assert.equal(slotText(LEDGER_V1, '14'), '## 14 — 2026-03-11 — first decision.')
  assert.equal(slotText(LEDGER_V1, '99'), null)
  assert.equal(slotText(null, '14'), null)
})

// GROUP: range-authorization-token-only, range-authorization-never-clears
test('a range edit clears only when the authorized text equals the final line', () => {
  const newText = ledger('EDITED.')
  const cleared = checkRange({
    oldText: LEDGER_V1,
    newText,
    authorized: new Map([['14', ['## 14 — 2026-03-11 — EDITED.']]]),
    gradeFormat: true,
  })
  // MUTATION: never clear a range finding → the matching authorization above still blocks.
  assert.deepEqual(cleared, [])
  // MUTATION: clear on the token alone → a waiver for 14 covers ANY final text for 14.
  const stale = checkRange({
    oldText: LEDGER_V1,
    newText,
    authorized: new Map([['14', ['## 14 — 2026-03-11 — an earlier waived text.']]]),
    gradeFormat: true,
  })
  assert.equal(
    stale.some((f) => f.token === '14'),
    true,
  )
})

// GROUP: range-unchanged-ledger-graded
test('a range that never touched the ledger reports nothing', () => {
  // MUTATION: drop the unchanged-ledger early return → an absent ledger at both ends reads as
  // deleted, and a malformed line already at the merge-base blocks every PR.
  const malformed = ledger('first decision.', 'second decision.', ['## 16 no date here'])
  for (const text of [null, malformed]) {
    const res = checkRange({
      oldText: text,
      newText: text,
      authorized: new Map(),
      gradeFormat: true,
    })
    assert.deepEqual(res, [])
  }
})

// GROUP: range-authorization-never-clears
test('an ABSENT authorization clears a waived removal', () => {
  const newText = '# Decisions\n\n> rule text\n\n## 15 — 2026-03-11 — second decision.\n'
  const res = checkRange({
    oldText: LEDGER_V1,
    newText,
    authorized: new Map([['14', [null]]]),
    gradeFormat: false,
  })
  assert.deepEqual(res, [])
})

// GROUP: range-authorization-token-only
test('an absent authorization does not clear a merge that reinstates the entry with new text', () => {
  const newText = ledger('REINSTATED.')
  // MUTATION: treat any absent-mapped authorization as clearing every finding for the token →
  // this reinstated (not removed) entry would wrongly clear even though the waiver only ever
  // authorized the entry's ABSENCE, not this new text.
  const res = checkRange({
    oldText: LEDGER_V1,
    newText,
    authorized: new Map([['14', [null]]]),
    gradeFormat: true,
  })
  assert.equal(
    res.some((f) => f.token === '14'),
    true,
  )
})

// GROUP: range-authorization-token-only
test('a non-empty authorization does not clear a merge that deletes the entry instead', () => {
  const newText = '# Decisions\n\n> rule text\n\n## 15 — 2026-03-11 — second decision.\n'
  // MUTATION: clear on the token alone regardless of value → a waived edit's authorized text
  // would also clear the entry's outright deletion, which was never the waived shape.
  const res = checkRange({
    oldText: LEDGER_V1,
    newText,
    authorized: new Map([['14', ['## 14 — 2026-03-11 — EDITED.']]]),
    gradeFormat: true,
  })
  assert.equal(
    res.some((f) => f.token === '14'),
    true,
  )
})

// GROUP: range-deletion-branch-dropped
test('checkRange reports the whole-file deletion finding when NEW is absent', () => {
  const res = checkRange({
    oldText: LEDGER_V1,
    newText: null,
    authorized: new Map(),
    gradeFormat: true,
  })
  // MUTATION: return [] when NEW is absent → a merge deleting the ledger passes.
  assert.deepEqual(res, [{ token: null, kind: 'deleted', detail: 'docs/decisions.md deleted' }])
})

test('an unwaived header edit blocks the range unit', () => {
  const newText = LEDGER_V1.replace('> rule text', '> EDITED rule text')
  const res = checkRange({
    oldText: LEDGER_V1,
    newText,
    authorized: new Map(),
    gradeFormat: true,
  })
  assert.equal(
    res.some((f) => f.token === 'header'),
    true,
  )
})

// GROUP: range-gradeformat-ignored
test('the range unit skips F1/F2 when a per-commit unit already graded this HEAD text', () => {
  // MUTATION: ignore gradeFormat → a format break the last commit already reported repeats.
  const newText = ledger('first decision.', 'second decision.', ['## 16 2026-03-12 broken'])
  const res = checkRange({ oldText: LEDGER_V1, newText, authorized: new Map(), gradeFormat: false })
  assert.deepEqual(res, [])
})

// GROUP: range-gradeformat-inverted
test('the range unit catches a malformed line no per-commit unit graded', () => {
  // MUTATION: invert gradeFormat (skip when true, grade when false) → a malformed line
  // introduced only by the merge resolution would silently pass.
  const newText = ledger('first decision.', 'second decision.', ['## 16 2026-03-12 broken'])
  const res = checkRange({ oldText: LEDGER_V1, newText, authorized: new Map(), gradeFormat: true })
  assert.equal(
    res.some((f) => f.kind === 'format'),
    true,
  )
})

// ---------------------------------------------------------------- spawned: merge commits

function runBase({ dir }, ref) {
  return runNode('check-decisions-ledger', [GUARD, '--base', ref], { cwd: dir })
}

function commit(r, text, message) {
  r.write('docs/decisions.md', text)
  r.git('add', '-A')
  r.git('commit', '-qm', message)
}

function readme(r) {
  r.write('README.md', 'unrelated\n')
  r.git('add', '-A')
  r.git('commit', '-qm', 'readme')
}

const waive = (token, subject) => `${subject}\n\nLedger-edit-ok: ${token} — ${GOOD_REASON}`

/** master = LEDGER_V1 + decision 16; `work` forks before 16 and runs `onWork` first. */
function forked(r, onWork) {
  commit(r, LEDGER_V1, 'init')
  r.git('branch', '-m', 'master')
  r.git('checkout', '-qb', 'work')
  onWork()
  r.git('checkout', '-q', 'master')
  commit(r, ledger(undefined, undefined, [E16_MASTER]), 'add decision 16')
  r.git('checkout', '-q', 'work')
}

/** Merge master into the current branch, resolving the ledger to `text`. */
function mergeMaster(r, text) {
  try {
    r.git('merge', '-q', '--no-ff', '--no-commit', 'master')
  } catch {
    // A ledger conflict is expected in some fixtures; the resolution below overwrites it.
  }
  commit(r, text, 'Merge branch master into work')
}

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

// GROUP: range-repeats-commit-findings
test('an unwaived edit on a branch with no merge is reported once, with the trailer hint', () =>
  withRepo((r) => {
    // MUTATION: drop the per-commit dedup → the same edit is reported again under [range] with
    // a merge-only hint on a branch that has no merge.
    commit(r, LEDGER_V1, 'init')
    r.git('branch', '-m', 'master')
    r.git('checkout', '-qb', 'work')
    commit(r, ledger('EDITED.'), 'edit 14')
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /→ add to the commit message: Ledger-edit-ok: 14/)
    assert.doesNotMatch(res.stderr, /a merge cannot waive/)
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
    commit(r, LEDGER_V1, 'init')
    r.git('branch', '-m', 'master')
    r.git('checkout', '-qb', 'work')
    r.write('README.md', 'x\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'readme')
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
    commit(r, LEDGER_V1, 'init')
    r.git('branch', '-m', 'master')
    r.git('tag', 'stale')
    r.git('checkout', '-qb', 'work')
    r.write('README.md', 'x\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'readme')
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

/** A ledger with only decision 15 and any extra entry lines (14 absent). */
function ledgerNo14(extra = []) {
  const lines = ['## 15 — 2026-03-11 — second decision.', ...extra]
  return `# Decisions\n\n> rule text\n\n${lines.join('\n')}\n`
}

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

// GROUP: range-gradeformat-last-unit
test('a numbering break made in a merge blocks even when a later commit leaves the ledger alone', () =>
  withRepo((r) => {
    // MUTATION: track the last unit instead of the last unit that CHANGED the ledger → the
    // trailing README commit's NEW equals HEAD and F1/F2 are skipped.
    forked(r, () => readme(r))
    mergeMaster(r, ledger(undefined, undefined, [E16_MASTER, '## 16 — 2026-03-12 — a duplicate.']))
    r.write('README.md', 'after the merge\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'readme after merge')
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /\[range\][\s\S]*## 16 follows ## 16/)
  }))

// GROUP: range-marker-exact-match, range-invalidation-counts-marker-appends
test('a waived edit that later gains an appended marker passes on a linear branch', () =>
  withRepo((r) => {
    // MUTATION: compare the whole raw line instead of body + marker superset → the marker
    // appended after the waiver no longer matches the waived text and the range unit blocks.
    commit(r, LEDGER_V1, 'init')
    r.git('branch', '-m', 'master')
    r.git('checkout', '-qb', 'work')
    commit(r, ledger('EDITED.'), waive(14, 'fix: reword 14'))
    commit(
      r,
      ledger('EDITED. Amended by 16.', undefined, ['## 16 — 2026-03-12 — amends 14.']),
      'feat: decision 16 amends 14',
    )
    assert.equal(runBase(r, 'master').status, 0)
  }))

test('concurrent waived edits on both sides let the merge keep either one', () =>
  withRepo((r) => {
    commit(r, LEDGER_V1, 'init')
    r.git('branch', '-m', 'master')
    r.git('tag', 'stale')
    r.git('checkout', '-qb', 'work')
    commit(r, ledger('BRANCH WORDING.'), waive(14, 'fix: reword 14 on the branch'))
    r.git('checkout', '-q', 'master')
    commit(r, ledger('MASTER WORDING.'), waive(14, 'fix: reword 14 on master'))
    r.git('checkout', '-q', 'work')
    mergeMaster(r, ledger('BRANCH WORDING.'))
    assert.equal(runBase(r, 'stale').status, 0)
  }))

// GROUP: range-ledgerless-waiver-recorded
test('a waiver on a commit with no ledger does not clear a merge dropping the last entry', () =>
  withRepo((r) => {
    // MUTATION: record waivers from a unit whose NEW has no ledger → its Ledger-edit-ok: 16
    // becomes an ABSENT authorization and clears the merge-only removal of ## 16.
    commit(r, ledger(undefined, undefined, [E16_MASTER]), 'init')
    r.git('branch', '-m', 'master')
    r.git('checkout', '-qb', 'work')
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

// GROUP: range-units-not-topo-ordered
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
