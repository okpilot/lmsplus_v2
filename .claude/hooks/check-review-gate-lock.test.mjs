// Unit test for the pre-commit review-gate lock guard. Run:
//   node --test .claude/hooks/check-review-gate-lock.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { addWorktree, arm, cleanup, makeRepo } from './review-gate.testkit.mjs'
import { runNode } from './spawn.testkit.mjs'

const GUARD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-review-gate-lock.mjs')
/**
 * `process.env` minus `REVIEW_GATE_ROOT`. The writer half of the gate honours that var, so an
 * ambient value would silently steer every test below at the root they do not set.
 */
const CLEAN_ENV = { ...process.env }
delete CLEAN_ENV.REVIEW_GATE_ROOT

const run = (cwd) =>
  runNode('check-review-gate-lock.mjs', [GUARD], { cwd, timeout: 10_000, env: CLEAN_ENV })

// CONTROL: red
// GROUP: check-review-gate-lock-always-passes
test('exits 1 naming plan-critic when the review-gate lock exists', () => {
  const dir = makeRepo()
  try {
    arm(dir)
    const r = run(dir)
    assert.equal(r.status, 1)
    assert.match(`${r.stdout}${r.stderr}`, /plan-critic/)
  } finally {
    cleanup(dir)
  }
})

// CONTROL: green
// GROUP: check-review-gate-lock-always-blocks
test('exits 0 when no review-gate lock exists', () => {
  const dir = makeRepo()
  try {
    assert.equal(run(dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

// GROUP: check-review-gate-lock-always-passes, check-review-gate-lock-no-common-dir
test('resolves the main checkout lock from a worktree', () => {
  const dir = makeRepo()
  try {
    const wt = addWorktree(dir, 'wt', 'wt-branch')
    arm(dir)
    const r = run(wt)
    assert.equal(r.status, 1)
    assert.match(`${r.stdout}${r.stderr}`, /plan-critic/)
  } finally {
    cleanup(dir)
  }
})

// GROUP: check-review-gate-lock-unresolvable-passes
test('exits 1 naming the common dir when run outside a git repository', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'no-repo-'))
  try {
    const r = runNode('check-review-gate-lock.mjs', [GUARD], {
      cwd: dir,
      timeout: 10_000,
      env: { ...CLEAN_ENV, GIT_CEILING_DIRECTORIES: path.dirname(dir) },
    })
    assert.equal(r.status, 1)
    assert.match(`${r.stdout}${r.stderr}`, /git common dir/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// GROUP: check-review-gate-lock-ignores-review-gate-root
test('exits 1 when the lock sits under REVIEW_GATE_ROOT, not the checkout', () => {
  // review-gate.js WRITES the lock under REVIEW_GATE_ROOT when set. If this guard resolved only
  // its own checkout it would find nothing and exit 0 with a round open — the two halves of one
  // gate disagreeing on where the lock lives (code-style.md §7).
  const checkout = makeRepo()
  const redirected = makeRepo()
  try {
    arm(redirected)
    const r = runNode('check-review-gate-lock.mjs', [GUARD], {
      cwd: checkout,
      timeout: 10_000,
      env: { ...CLEAN_ENV, REVIEW_GATE_ROOT: redirected },
    })
    assert.equal(r.status, 1)
    assert.match(`${r.stdout}${r.stderr}`, /plan-critic/)
  } finally {
    cleanup(checkout)
    cleanup(redirected)
  }
})
