// Unit test for the pre-commit review-gate lock guard. Run:
//   node --test .claude/hooks/check-review-gate-lock.test.mjs
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { addWorktree, arm, cleanup, makeRepo } from './review-gate.testkit.mjs'
import { runNode } from './spawn.testkit.mjs'

const GUARD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-review-gate-lock.mjs')
const run = (cwd) => runNode('check-review-gate-lock.mjs', [GUARD], { cwd, timeout: 10_000 })

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
