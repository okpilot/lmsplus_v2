// Unit test for which branch the review-gate hook arms and unlocks: the checkout the Agent
// payload `cwd` is in. Run: node .claude/hooks/review-gate.session.test.mjs
import assert from 'node:assert/strict'
import { mkdirSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import {
  addWorktree,
  cleanup,
  dispatchFrom,
  isArmed,
  makeDir,
  payload,
  runHook,
  withState,
} from './review-gate.testkit.mjs'

const MAIN = 'feat/work'
const OTHER = 'feat/other'

/** Temp repo with a human worktree on `feat/other`, both resolved to real paths. */
function makeRepo() {
  const dir = realpathSync(makeDir())
  const human = realpathSync(addWorktree(dir, 'human', OTHER))
  return { dir, human }
}

// GROUP: review-gate-arms-main-not-session
test('arms the branch of the worktree the reviewer was dispatched from', () => {
  const { dir, human } = makeRepo()
  try {
    assert.equal(dispatchFrom(dir, 'semantic-reviewer', human).status, 0)
    assert.equal(isArmed(dir, OTHER), true)
    assert.equal(isArmed(dir, MAIN), false)
    assert.equal(runHook(payload(path.join(human, 'src', 'a.ts')), dir).status, 2)
    assert.equal(runHook(payload(path.join(dir, 'src', 'a.ts')), dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-arms-main-not-session
test('unlocks only the dispatching worktree branch', () => {
  const { dir, human } = makeRepo()
  try {
    withState(dir, { [MAIN]: false, [OTHER]: false })
    assert.equal(dispatchFrom(dir, 'plan-critic', human).status, 0)
    assert.equal(isArmed(dir, MAIN), true)
    assert.equal(isArmed(dir, OTHER), false)
    assert.equal(runHook(payload(path.join(human, 'src', 'a.ts')), dir).status, 0)
    assert.equal(runHook(payload(path.join(dir, 'src', 'a.ts')), dir).status, 2)
  } finally {
    cleanup(dir)
  }
})

test('arms the main branch when dispatched from a subdirectory of the main checkout', () => {
  const { dir } = makeRepo()
  try {
    const sub = path.join(dir, 'apps', 'web')
    mkdirSync(sub, { recursive: true })
    assert.equal(dispatchFrom(dir, 'semantic-reviewer', sub).status, 0)
    assert.equal(isArmed(dir, MAIN), true)
  } finally {
    cleanup(dir)
  }
})

test('arms the main branch when dispatched from an agent worktree', () => {
  const { dir } = makeRepo()
  try {
    const agent = addWorktree(dir, 'agent-x', 'worktree-agent-x')
    assert.equal(dispatchFrom(dir, 'semantic-reviewer', agent).status, 0)
    assert.equal(isArmed(dir, MAIN), true)
  } finally {
    cleanup(dir)
  }
})

test('arms the main branch when dispatched from a directory outside the repo', () => {
  const { dir } = makeRepo()
  try {
    assert.equal(dispatchFrom(dir, 'semantic-reviewer', '/nonexistent/elsewhere').status, 0)
    assert.equal(isArmed(dir, MAIN), true)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-cwd-type-unguarded
test('arms the main branch when the dispatch payload carries a non-string cwd', () => {
  const { dir } = makeRepo()
  try {
    assert.equal(dispatchFrom(dir, 'semantic-reviewer', 42).status, 0)
    assert.equal(isArmed(dir, MAIN), true)
  } finally {
    cleanup(dir)
  }
})
