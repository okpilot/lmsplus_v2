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

// GROUP: range-authorization-token-only
test('a range edit clears only when the authorized text equals the final line', () => {
  const newText = ledger('EDITED.')
  const cleared = checkRange({
    oldText: LEDGER_V1,
    newText,
    authorized: new Map([['14', '## 14 — 2026-03-11 — EDITED.']]),
    gradeFormat: true,
  })
  assert.deepEqual(cleared, [])
  // MUTATION: clear on the token alone → a waiver for 14 covers ANY final text for 14.
  const stale = checkRange({
    oldText: LEDGER_V1,
    newText,
    authorized: new Map([['14', '## 14 — 2026-03-11 — an earlier waived text.']]),
    gradeFormat: true,
  })
  assert.equal(
    stale.some((f) => f.token === '14'),
    true,
  )
})

test('an ABSENT authorization clears a waived removal', () => {
  const newText = '# Decisions\n\n> rule text\n\n## 15 — 2026-03-11 — second decision.\n'
  const res = checkRange({
    oldText: LEDGER_V1,
    newText,
    authorized: new Map([['14', null]]),
    gradeFormat: false,
  })
  assert.deepEqual(res, [])
})

// GROUP: range-gradeformat-ignored
test('the range unit skips F1/F2 when a per-commit unit already graded this HEAD text', () => {
  // MUTATION: ignore gradeFormat → a format break the last commit already reported repeats.
  const newText = ledger('first decision.', 'second decision.', ['## 16 2026-03-12 broken'])
  const res = checkRange({ oldText: LEDGER_V1, newText, authorized: new Map(), gradeFormat: false })
  assert.deepEqual(res, [])
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

// GROUP: range-authorization-token-only
test('a waived edit re-edited by a merge is blocked', () =>
  withRepo((r) => {
    forked(r, () => commit(r, ledger('EDITED.'), waive(14, 'fix: reword 14')))
    mergeMaster(r, ledger('EDITED AGAIN IN MERGE.', undefined, [E16_MASTER]))
    assert.equal(runBase(r, 'master').status, 1)
  }))

// GROUP: range-authorization-accumulated
test('a merge reinstating a superseded waived text is blocked', () =>
  withRepo((r) => {
    // MUTATION: keep the FIRST authorization per token instead of the last → A clears.
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
