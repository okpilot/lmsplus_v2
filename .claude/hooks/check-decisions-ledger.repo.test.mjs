// Run: node --test .claude/hooks/check-decisions-ledger.repo.test.mjs
//
// The commit-msg-mode git-facing paths of the decisions-ledger guard (Decision 86): the INDEX
// read, F1/F2 on a new ledger, and the absent-vs-fault probing. --base-mode tests live in
// check-decisions-ledger.base.test.mjs; pure decision logic in check-decisions-ledger.test.mjs.
//
// Every case is MUTATION-PINNED (code-style.md §7); the exact set each break reddens is DATA
// in check-decisions-ledger.mutations.json, re-derived by
// `node .claude/hooks/run-mutations.mjs --guard check-decisions-ledger`.

import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { GOOD_REASON, GUARD, LEDGER_V1, withRepo } from './check-decisions-ledger.testkit.mjs'
import { runNode } from './spawn.testkit.mjs'

/** Run the commit-msg-mode guard in `dir` against a message file holding `message`. */
function runCommitMsg({ dir }, message) {
  const msgPath = join(dir, '.git', 'COMMIT_EDITMSG_TEST')
  writeFileSync(msgPath, message)
  const { status, stderr, stdout } = runNode('check-decisions-ledger', [GUARD, msgPath], {
    cwd: dir,
  })
  return { status, stderr, stdout }
}

// ---------------------------------------------------------------- commit-msg mode

// CONTROL: red
// GROUP: check-decisions-ledger-always-passes, commitmsg-index-read-swapped
test('blocks an edit to an existing line staged for commit', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write(
      'docs/decisions.md',
      '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision, EDITED.\n## 15 — 2026-03-11 — second decision.\n',
    )
    r.git('add', '-A')
    // MUTATION: swap readIndex for readAtTree('HEAD', ...) as NEW → the staged edit is
    // invisible (NEW reads the unedited HEAD copy), and every editing commit passes clean.
    const res = runCommitMsg(r, 'fix: reword decision 14\n')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /## 14 — body edited/)
  }))

// CONTROL: green
// GROUP: check-decisions-ledger-always-blocks
test('allows appending a new decision line', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('docs/decisions.md', `${LEDGER_V1}## 16 — 2026-03-12 — a new decision.\n`)
    r.git('add', '-A')
    assert.equal(runCommitMsg(r, 'chore: append decision 16\n').status, 0)
  }))

// GROUP: check-decisions-ledger-always-blocks
test('allows appending a marker to an existing line', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write(
      'docs/decisions.md',
      '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision.\n## 15 — 2026-03-11 — second decision. Superseded by 16.\n## 16 — 2026-03-12 — third decision.\n',
    )
    r.git('add', '-A')
    assert.equal(runCommitMsg(r, 'chore: decision 16 supersedes 15\n').status, 0)
  }))

// GROUP: check-decisions-ledger-always-passes
test('blocks changing an existing marker to a different number', () =>
  withRepo((r) => {
    r.write(
      'docs/decisions.md',
      '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first.\n## 15 — 2026-03-11 — second. Superseded by 16.\n',
    )
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write(
      'docs/decisions.md',
      '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first.\n## 15 — 2026-03-11 — second. Superseded by 99.\n',
    )
    r.git('add', '-A')
    const res = runCommitMsg(r, 'chore: oops\n')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /## 15 — lost marker/)
  }))

// GROUP: check-decisions-ledger-always-blocks
test('a Ledger-edit-ok trailer waives the edit it names', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write(
      'docs/decisions.md',
      '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision, EDITED.\n## 15 — 2026-03-11 — second decision.\n',
    )
    r.git('add', '-A')
    const res = runCommitMsg(r, `fix: reword decision 14\n\nLedger-edit-ok: 14 — ${GOOD_REASON}\n`)
    assert.equal(res.status, 0)
  }))

// GROUP: check-decisions-ledger-always-passes, waiver-reason-length-check-dropped
test('an unusable waiver reason still blocks the commit', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write(
      'docs/decisions.md',
      '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision, EDITED.\n## 15 — 2026-03-11 — second decision.\n',
    )
    r.git('add', '-A')
    // MUTATION: drop the `< 20` reason-length check → a short, non-blocklisted reason waives
    // the edit.
    const res = runCommitMsg(r, 'fix: reword decision 14\n\nLedger-edit-ok: 14 — too short\n')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /unusable Ledger-edit-ok trailer/)
  }))

test('reads the ledger from the INDEX, ignoring an unstaged working-tree edit', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    // Edit ONLY on disk, never staged. The guard must see the STAGED (unedited) copy.
    r.write(
      'docs/decisions.md',
      '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision, EDITED ON DISK ONLY.\n## 15 — 2026-03-11 — second decision.\n',
    )
    assert.equal(runCommitMsg(r, 'chore: unrelated\n').status, 0)
  }))

// ---------------------------------------------------------------- format / numbering (F1/F2), not waivable

// GROUP: check-decisions-ledger-always-passes
test('blocks a malformed new entry line even with a matching waiver token', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('docs/decisions.md', `${LEDGER_V1}## 16 2026-03-12 missing dashes\n`)
    r.git('add', '-A')
    const res = runCommitMsg(r, `chore: append\n\nLedger-edit-ok: 16 — ${GOOD_REASON}\n`)
    assert.equal(res.status, 1)
    assert.match(res.stderr, /malformed entry line/)
  }))

test('blocks a numbering gap in a newly appended line', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('docs/decisions.md', `${LEDGER_V1}## 20 — 2026-03-12 — a gap.\n`)
    r.git('add', '-A')
    const res = runCommitMsg(r, 'chore: append\n')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /## 20 follows ## 15, expected ## 16/)
  }))

// ---------------------------------------------------------------- absent-vs-fault

test('a file deletion is blocked', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.git('rm', '-q', 'docs/decisions.md')
    const res = runCommitMsg(r, 'chore: remove\n')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /deleted/)
  }))

// GROUP: unborn-head-not-treated-as-absent
test('commit-msg mode on the FIRST commit (unborn HEAD) runs F1/F2 with no immutability check', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    // MUTATION: let refExists('HEAD') throw instead of returning false on an unborn HEAD →
    // the very first commit ever made to this file aborts at exit 2 instead of running clean.
    assert.equal(runCommitMsg(r, 'chore: add ledger\n').status, 0)
  }))

// ---------------------------------------------------------------- commit-msg mode during a merge (skipped, #1350)

// GROUP: mergehead-skip-dropped
test('a clean merge auto-adopting an already-waived incoming edit passes', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.git('branch', '-m', 'master')
    r.git('checkout', '-qb', 'feature')
    r.write(
      'docs/decisions.md',
      '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision, FEATURE EDIT.\n## 15 — 2026-03-11 — second decision.\n',
    )
    r.git('add', '-A')
    // The edit on `feature` already passed its OWN commit-msg gate with a waiver, historically.
    r.git('commit', '-qm', `fix: reword decision 14\n\nLedger-edit-ok: 14 — ${GOOD_REASON}`)
    r.git('checkout', '-q', 'master')
    r.write('README.md', 'unrelated master change\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'unrelated master work')
    // MUTATION: drop the MERGE_HEAD skip → the incoming edit reads as new against HEAD and
    // blocks the auto-generated merge commit.
    r.git('merge', '--no-ff', '--no-commit', 'feature')
    const res = runCommitMsg(r, "Merge branch 'feature'\n")
    assert.equal(res.status, 0)
  }))

// ---------------------------------------------------------------- CLI usage

// GROUP: usage-check-dropped
test('exits 2 on an unrecognised argument shape', () =>
  withRepo((r) => {
    const res = runNode('check-decisions-ledger', [GUARD, '--bogus'], { cwd: r.dir })
    assert.equal(res.status, 2)
    assert.match(res.stderr, /usage:/)
  }))
