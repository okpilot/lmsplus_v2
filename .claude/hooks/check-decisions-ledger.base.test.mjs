// Run: node --test .claude/hooks/check-decisions-ledger.base.test.mjs
//
// The --base-mode git-facing paths of the decisions-ledger guard (Decision 86): per-commit
// tree reads, per-commit waiver scoping, and the whole-range unit. Fixtures/helpers
// (`withRepo`, `LEDGER_V1`, `GOOD_REASON`, `GUARD`) are imported from the sibling commit-msg
// suite, check-decisions-ledger.repo.test.mjs, which still owns and exports them.
//
// Every case is MUTATION-PINNED (code-style.md §7); the exact set each break reddens is DATA
// in check-decisions-ledger.mutations.json, re-derived by
// `node .claude/hooks/run-mutations.mjs --guard check-decisions-ledger`.

import assert from 'node:assert/strict'
import test from 'node:test'
import { GOOD_REASON, GUARD, LEDGER_V1, withRepo } from './check-decisions-ledger.testkit.mjs'
import { runNode } from './spawn.testkit.mjs'

/** Run the --base-mode guard in `dir`. */
function runBase({ dir }, ref) {
  const { status, stderr, stdout } = runNode('check-decisions-ledger', [GUARD, '--base', ref], {
    cwd: dir,
  })
  return { status, stderr, stdout }
}

// ---------------------------------------------------------------- --base mode: per-commit scoping

// CONTROL: red
// GROUP: check-decisions-ledger-always-passes, base-per-commit-old-ref-wrong
test('--base catches an edit made in a middle commit of the range', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.git('branch', '-m', 'master')
    r.git('checkout', '-qb', 'work')
    r.write('README.md', 'unrelated\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'unrelated change')
    r.write(
      'docs/decisions.md',
      '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision, EDITED.\n## 15 — 2026-03-11 — second decision.\n',
    )
    r.git('add', '-A')
    // MUTATION: diff `sha` against `sha^^` (grandparent) instead of `sha^` (parent) for OLD →
    // the previous commit's own additions leak into "OLD", masking what THIS commit changed.
    r.git('commit', '-qm', 'edit decision 14')
    r.write('README.md', 'unrelated, again\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'more unrelated work')
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /## 14 — body edited/)
  }))

// CONTROL: green
// GROUP: check-decisions-ledger-always-blocks
test('--base is clean across a range of commits that never touch decisions.md after init', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.git('branch', '-m', 'master')
    r.git('checkout', '-qb', 'work')
    r.write('README.md', 'a\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'one')
    r.write('README.md', 'b\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'two')
    assert.equal(runBase(r, 'master').status, 0)
  }))

// CONTROL: red
// GROUP: check-decisions-ledger-always-passes
test('a conflict-resolved --no-ff merge that rewrites an existing entry is caught by the range unit', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.write('README.md', 'base\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.git('branch', '-m', 'master')
    r.git('checkout', '-qb', 'left')
    r.write('README.md', 'left change\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'left readme change')
    r.git('checkout', '-q', 'master')
    r.git('checkout', '-qb', 'right')
    r.write('README.md', 'right change\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'right readme change')
    r.git('checkout', '-q', 'master')
    r.git('checkout', '-qb', 'work')
    r.git('merge', '-q', '--no-ff', 'left', '-m', 'merge left')
    // A genuine README conflict between 'work' and 'right'; neither parent touches decisions.md.
    // MUTATION: drop the range unit → the merge commit's own tree is never read, clean passes.
    let conflicted = false
    try {
      r.git('merge', '--no-ff', 'right', '-m', 'merge right')
    } catch {
      conflicted = true
    }
    assert.equal(conflicted, true)
    r.write('README.md', 'resolved\n')
    r.write(
      'docs/decisions.md',
      '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision, REWRITTEN DURING MERGE.\n## 15 — 2026-03-11 — second decision.\n',
    )
    r.git('add', '-A')
    r.git('commit', '-qm', 'merge right (resolved)')
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /## 14 — body edited/)
  }))

// GROUP: range-pool-excludes-per-commit-applied
test('a waived per-commit edit still passes the range unit', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.git('branch', '-m', 'master')
    r.git('checkout', '-qb', 'work')
    r.write(
      'docs/decisions.md',
      '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision, EDITED.\n## 15 — 2026-03-11 — second decision.\n',
    )
    r.git('add', '-A')
    // MUTATION: drop the per-commit APPLIED pool from the range unit's own → the waiver this
    // commit applied to its own edit no longer reaches the range unit, and it blocks.
    r.git('commit', '-qm', `fix: reword decision 14\n\nLedger-edit-ok: 14 — ${GOOD_REASON}`)
    const res = runBase(r, 'master')
    assert.equal(res.status, 0)
  }))

// GROUP: range-pool-excludes-per-commit-applied
test('a waiver in a non-last commit of the range still waives its own edit', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.git('branch', '-m', 'master')
    r.git('checkout', '-qb', 'work')
    r.write(
      'docs/decisions.md',
      '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision, EDITED.\n## 15 — 2026-03-11 — second decision.\n',
    )
    r.git('add', '-A')
    // Waiver in the FIRST (non-last) commit of the range.
    r.git('commit', '-qm', `fix: reword decision 14\n\nLedger-edit-ok: 14 — ${GOOD_REASON}`)
    r.write(
      'docs/decisions.md',
      '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision, EDITED.\n## 15 — 2026-03-11 — second decision.\n## 16 — 2026-03-12 — a new decision.\n',
    )
    r.git('add', '-A')
    r.git('commit', '-qm', 'chore: append decision 16')
    const res = runBase(r, 'master')
    assert.equal(res.status, 0)
  }))

// GROUP: applied-waivers-not-filtered
test('an unapplied waiver on an empty commit does not waive an unrelated merge-commit edit', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.write('README.md', 'base\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.git('branch', '-m', 'master')
    r.git('checkout', '-qb', 'empty-waiver')
    r.write('README.md', 'unrelated\n')
    r.git('add', '-A')
    // MUTATION: let `applied` include every parsed waiver, not just ones that cleared a
    // finding → this commit's waiver (which cleared NOTHING here) still reaches the range pool.
    r.git('commit', '-qm', `chore: unrelated\n\nLedger-edit-ok: 14 — ${GOOD_REASON}`)
    r.git('checkout', '-q', 'master')
    r.git('checkout', '-qb', 'right')
    r.write('README.md', 'right change\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'right readme change')
    r.git('checkout', '-q', 'master')
    r.git('checkout', '-qb', 'work')
    r.git('merge', '-q', '--no-ff', 'empty-waiver', '-m', 'merge empty-waiver')
    let conflicted = false
    try {
      r.git('merge', '--no-ff', 'right', '-m', 'merge right')
    } catch {
      conflicted = true
    }
    assert.equal(conflicted, true)
    r.write('README.md', 'resolved\n')
    r.write(
      'docs/decisions.md',
      '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision, REWRITTEN DURING MERGE.\n## 15 — 2026-03-11 — second decision.\n',
    )
    r.git('add', '-A')
    // The merge commit itself carries no waiver of its own.
    r.git('commit', '-qm', 'merge right (resolved)')
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /## 14 — body edited/)
  }))

// GROUP: range-pool-excludes-merge-own
test('a merge commit carrying its own waiver for its own resolution edit passes the range unit', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.write('README.md', 'base\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.git('branch', '-m', 'master')
    r.git('checkout', '-qb', 'left')
    r.write('README.md', 'left change\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'left readme change')
    r.git('checkout', '-q', 'master')
    r.git('checkout', '-qb', 'right')
    r.write('README.md', 'right change\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'right readme change')
    r.git('checkout', '-q', 'master')
    r.git('checkout', '-qb', 'work')
    r.git('merge', '-q', '--no-ff', 'left', '-m', 'merge left')
    let conflicted = false
    try {
      r.git('merge', '--no-ff', 'right', '-m', 'merge right')
    } catch {
      conflicted = true
    }
    assert.equal(conflicted, true)
    r.write('README.md', 'resolved\n')
    r.write(
      'docs/decisions.md',
      '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision, REWRITTEN DURING MERGE.\n## 15 — 2026-03-11 — second decision.\n',
    )
    r.git('add', '-A')
    // MUTATION: drop the merge commit's own trailer from the range pool → this waiver never
    // reaches the range unit, and the edit blocks despite being explicitly waived.
    r.git('commit', '-qm', `merge right (resolved)\n\nLedger-edit-ok: 14 — ${GOOD_REASON}`)
    const res = runBase(r, 'master')
    assert.equal(res.status, 0)
  }))

// GROUP: waiver-scoped-to-wrong-commit
test('a waiver trailer in one commit does not cover an edit made in an earlier commit', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.git('branch', '-m', 'master')
    r.git('checkout', '-qb', 'work')
    r.write(
      'docs/decisions.md',
      '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision, EDITED.\n## 15 — 2026-03-11 — second decision.\n',
    )
    r.git('add', '-A')
    // Commit A: the edit, WITH NO waiver trailer.
    r.git('commit', '-qm', 'edit decision 14')
    r.write('README.md', 'unrelated\n')
    r.git('add', '-A')
    // Commit B: unrelated, but carries a waiver naming the SAME token as commit A's edit.
    // MUTATION: concatenate every commit's message into one shared waiver map (the
    // documented anti-pattern check-retracted-phrase.mjs's own comment warns against) →
    // commit B's waiver clears commit A's un-waived finding, and the escape hatch stops
    // being scoped to the commit whose author actually wrote it.
    r.git('commit', '-qm', `chore: unrelated\n\nLedger-edit-ok: 14 — ${GOOD_REASON}`)
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /## 14 — body edited/)
  }))

test('an edit then a restore across two commits is still flagged (the file is not diffed end to end)', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.git('branch', '-m', 'master')
    r.git('checkout', '-qb', 'work')
    r.write(
      'docs/decisions.md',
      '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision, EDITED.\n## 15 — 2026-03-11 — second decision.\n',
    )
    r.git('add', '-A')
    r.git('commit', '-qm', 'edit decision 14')
    // Restores the original text in a SECOND commit — the branch tip equals master's copy,
    // but each commit is graded against its OWN parent, so the intermediate edit still fires.
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'revert the edit')
    const res = runBase(r, 'master')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /## 14 — body edited/)
  }))

// GROUP: base-root-commit-not-handled
test('--base handles a root commit in the range (no parent to diff against)', () =>
  withRepo((r) => {
    // Two independent histories joined by ONE `--allow-unrelated-histories` merge: the
    // per-commit range still contains a genuine root commit (no parent) while base and HEAD
    // share a real merge-base for the range unit (§ fix 2) to resolve against — an orphan
    // base with NO shared history at all now makes the range unit's own merge-base call
    // fault (exit 2), which is a DIFFERENT case, covered separately below.
    r.git('checkout', '-q', '--orphan', 'origin-base')
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'origin base')
    r.git('tag', 'base-tag')

    r.git('checkout', '-q', '--orphan', 'root-only')
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    // MUTATION: read `<sha>^` without checking it resolves first → this root commit's OLD
    // read throws (no such ref) instead of being treated as absent, aborting at exit 2.
    r.git('commit', '-qm', 'root of an unrelated line, has decisions.md')

    r.git('checkout', '-q', 'origin-base')
    r.git(
      'merge',
      '-q',
      '--allow-unrelated-histories',
      '--no-ff',
      'root-only',
      '-m',
      'merge unrelated root',
    )
    const res = runBase(r, 'base-tag')
    assert.notEqual(res.status, 2)
  }))

test('a merge-base that cannot resolve (no shared history at all) is a fault, exit 2', () =>
  withRepo((r) => {
    r.git('checkout', '-q', '--orphan', 'base-empty')
    r.write('.gitkeep', '')
    r.git('add', '-A')
    r.git('commit', '-qm', 'unrelated orphan base')
    r.git('checkout', '-q', '--orphan', 'master')
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'root of master, disjoint from base-empty')
    const res = runBase(r, 'base-empty')
    assert.equal(res.status, 2)
  }))

// ---------------------------------------------------------------- CLI usage / git faults

test('exits 2 when --base is given no ref', () =>
  withRepo((r) => {
    const res = runNode('check-decisions-ledger', [GUARD, '--base'], { cwd: r.dir })
    assert.equal(res.status, 2)
    assert.match(res.stderr, /--base requires a ref/)
  }))

// GROUP: top-level-catch-exit-code
test('--base against a ref that does not exist is a git fault, not a usage error — exits 2', () =>
  withRepo((r) => {
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    // MUTATION: change the top-level catch's exit(2) to exit(0) → a git command that fails
    // outright (unresolvable base ref, not merely absent) is swallowed as a clean run instead
    // of blocking with "check could not run".
    const res = runNode('check-decisions-ledger', [GUARD, '--base', 'this-ref-does-not-exist'], {
      cwd: r.dir,
    })
    assert.equal(res.status, 2)
    assert.match(res.stderr, /check could not run/)
  }))
