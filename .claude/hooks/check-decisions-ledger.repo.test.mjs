// Run: node --test .claude/hooks/check-decisions-ledger.repo.test.mjs
//
// The git-facing paths of the decisions-ledger guard (Decision 86): commit-msg mode's index
// read, --base mode's per-commit tree reads and per-commit waiver scoping, and the
// absent-vs-fault probing. The pure decision logic lives in check-decisions-ledger.test.mjs,
// so neither file approaches the test-file cap in .claude/limits.json.
//
// Every case is MUTATION-PINNED (code-style.md §7); the exact set each break reddens is DATA
// in check-decisions-ledger.mutations.json, re-derived by
// `node .claude/hooks/run-mutations.mjs --guard check-decisions-ledger`.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runNode } from './spawn.testkit.mjs'

const GUARD = join(dirname(fileURLToPath(import.meta.url)), 'check-decisions-ledger.mjs')
const GOOD_REASON = 'because this is a genuinely safe correction'

const LEDGER_V1 =
  '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision.\n## 15 — 2026-03-11 — second decision.\n'

/** A throwaway repo, removed however the body exits. */
function withRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'decisions-ledger-'))
  try {
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
    git('init', '-q', '.')
    git('config', 'user.email', 't@example.com')
    git('config', 'user.name', 'Test')
    // Isolate from the RUNNER's global git config — see check-md-allowlist.repo.test.mjs for
    // why both lines are needed (signing key demand, someone else's hooksPath).
    git('config', 'commit.gpgsign', 'false')
    git('config', 'core.hooksPath', join(dir, '.git', 'no-hooks'))
    const write = (rel, body) => {
      mkdirSync(join(dir, dirname(rel)), { recursive: true })
      writeFileSync(join(dir, rel), body)
    }
    return fn({ dir, git, write })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Run the commit-msg-mode guard in `dir` against a message file holding `message`. */
function runCommitMsg({ dir }, message) {
  const msgPath = join(dir, '.git', 'COMMIT_EDITMSG_TEST')
  writeFileSync(msgPath, message)
  const { status, stderr, stdout } = runNode('check-decisions-ledger', [GUARD, msgPath], {
    cwd: dir,
  })
  return { status, stderr, stdout }
}

/** Run the --base-mode guard in `dir`. */
function runBase({ dir }, ref) {
  const { status, stderr, stdout } = runNode('check-decisions-ledger', [GUARD, '--base', ref], {
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

// GROUP: check-decisions-ledger-always-passes
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

// GROUP: check-decisions-ledger-always-blocks, waiver-reason-length-check-dropped
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
    // MUTATION: drop the `< 20` reason-length check → a bare "Ledger-edit-ok: 14 — ok" waives
    // any edit with no stated justification, the same hole check-retracted-phrase closed.
    const res = runCommitMsg(r, 'fix: reword decision 14\n\nLedger-edit-ok: 14 — ok\n')
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
    // An orphan base with NO shared history: rev-list base..master then enumerates master's
    // OWN root commit too (nothing on master is reachable from this base), which is the only
    // way to put a root commit inside a --base RANGE rather than have it just BE the base.
    r.git('checkout', '-q', '--orphan', 'base-empty')
    r.write('.gitkeep', '')
    r.git('add', '-A')
    r.git('commit', '-qm', 'unrelated orphan base')
    r.git('checkout', '-q', '--orphan', 'master')
    r.git('rm', '-rf', '--cached', '.')
    r.write('docs/decisions.md', LEDGER_V1)
    r.git('add', '-A')
    // MUTATION: read `<sha>^` without checking it resolves first → a root commit's OLD read
    // throws (no such ref) instead of being treated as absent, and the whole run aborts at
    // exit 2 for a perfectly legitimate first commit.
    r.git('commit', '-qm', 'root of master, has decisions.md')
    const res = runBase(r, 'base-empty')
    assert.notEqual(res.status, 2)
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

// ---------------------------------------------------------------- CLI usage

// GROUP: usage-check-dropped
test('exits 2 on an unrecognised argument shape', () =>
  withRepo((r) => {
    const res = runNode('check-decisions-ledger', [GUARD, '--bogus'], { cwd: r.dir })
    assert.equal(res.status, 2)
    assert.match(res.stderr, /usage:/)
  }))

test('exits 2 when --base is given no ref', () =>
  withRepo((r) => {
    const res = runNode('check-decisions-ledger', [GUARD, '--base'], { cwd: r.dir })
    assert.equal(res.status, 2)
    assert.match(res.stderr, /--base requires a ref/)
  }))
