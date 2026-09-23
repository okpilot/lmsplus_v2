// Run: node --test .claude/hooks/check-decisions-ledger.range-pure.test.mjs
//
// The pure half of the decisions-ledger --base RANGE unit (#1350): slotText and checkRange.
// Spawned merge-commit repros live in check-decisions-ledger.range.test.mjs.
//
// Every case is MUTATION-PINNED (code-style.md §7); the exact set each break reddens is DATA
// in check-decisions-ledger.mutations.json, re-derived by
// `node .claude/hooks/run-mutations.mjs --guard check-decisions-ledger`.

import assert from 'node:assert/strict'
import test from 'node:test'
import { checkRange, slotText } from './check-decisions-ledger.mjs'
import { LEDGER_V1, ledger } from './check-decisions-ledger.testkit.mjs'

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
