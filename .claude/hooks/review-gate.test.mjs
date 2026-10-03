// Unit test for the review-gate hook (PostToolUse Agent + PreToolUse Edit|Write). Run:
//   node .claude/hooks/review-gate.test.mjs
// Spawns the real hook as a child process and feeds the Claude Code hook payload
// on STDIN — the channel the harness actually uses — so these tests pin the
// input contract and gate-state behaviour, not just the pattern matching.
import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import {
  addWorktree,
  BRANCH,
  cleanup,
  dispatch,
  gitIn,
  HOOK,
  makeDir,
  payload,
  prodEdit,
  readState,
  runHook,
  statePath,
  TIMEOUT_MS,
  withState,
} from './review-gate.testkit.mjs'
import { runNode } from './spawn.testkit.mjs'

// --- No gate state ---

// CONTROL: green
// GROUP: review-gate-always-blocks
test('allows any edit when no gate state exists', () => {
  const dir = makeDir()
  try {
    assert.equal(prodEdit(dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

// --- Armed — production files are blocked ---

// CONTROL: red
// GROUP: review-gate-always-passes
test('blocks a production edit after a review round until plan-critic is dispatched', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: false })
    const r = prodEdit(dir)
    assert.equal(r.status, 2)
    assert.match(r.stderr, /BLOCKED/)
    assert.match(r.stderr, /plan-critic/)
  } finally {
    cleanup(dir)
  }
})

// --- Arm and unlock through Agent events ---

// GROUP: review-gate-no-arm
test('arms the branch when a gate-round agent is dispatched', () => {
  const dir = makeDir()
  try {
    assert.equal(dispatch(dir, 'semantic-reviewer').status, 0)
    assert.deepEqual(readState(dir), { branches: { [BRANCH]: { unlocked: false } } })
    assert.equal(prodEdit(dir).status, 2)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-no-arm
test('arms the branch when a conditional agent is dispatched', () => {
  const dir = makeDir()
  try {
    assert.equal(dispatch(dir, 'red-team').status, 0)
    assert.equal(prodEdit(dir).status, 2)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-no-unlock
test('unlocks the branch when plan-critic is dispatched after a round', () => {
  const dir = makeDir()
  try {
    dispatch(dir, 'semantic-reviewer')
    assert.equal(dispatch(dir, 'plan-critic').status, 0)
    assert.equal(prodEdit(dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-unreadable-unlock-skipped
test('unlocks after plan-critic when the state file was unreadable', () => {
  const dir = makeDir()
  try {
    writeFileSync(statePath(dir), JSON.stringify({ findings: [] }), 'utf8')
    assert.equal(dispatch(dir, 'plan-critic').status, 0)
    assert.equal(prodEdit(dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-no-arm
test('arms the branch again when the next round dispatches a reviewer', () => {
  const dir = makeDir()
  try {
    dispatch(dir, 'semantic-reviewer')
    dispatch(dir, 'plan-critic')
    dispatch(dir, 'semantic-reviewer')
    assert.equal(prodEdit(dir).status, 2)
  } finally {
    cleanup(dir)
  }
})

test('leaves the state unchanged when a non-gate agent is dispatched', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: true })
    assert.equal(dispatch(dir, 'Explore').status, 0)
    assert.equal(dispatch(dir).status, 0)
    assert.deepEqual(readState(dir), { branches: { [BRANCH]: { unlocked: true } } })
  } finally {
    cleanup(dir)
  }
})

test('writes no state when plan-critic is dispatched before any round', () => {
  const dir = makeDir()
  try {
    assert.equal(dispatch(dir, 'plan-critic').status, 0)
    assert.equal(existsSync(statePath(dir)), false)
  } finally {
    cleanup(dir)
  }
})

test('keeps the other branches entries when a dispatch arms the current branch', () => {
  const dir = makeDir()
  try {
    withState(dir, { 'feat/other': true })
    dispatch(dir, 'semantic-reviewer')
    assert.deepEqual(readState(dir).branches, {
      'feat/other': { unlocked: true },
      [BRANCH]: { unlocked: false },
    })
  } finally {
    cleanup(dir)
  }
})

// --- Per-branch state ---

// GROUP: review-gate-ignores-branch
test('allows a production edit when the armed entry belongs to another branch', () => {
  const dir = makeDir()
  try {
    withState(dir, { 'feat/other': false })
    assert.equal(prodEdit(dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-unlock-ignored
test('allows a production edit when the branch is unlocked', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: true })
    assert.equal(prodEdit(dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-outside-repo-blocked
test('allows a production file outside the repo root when the gate is armed', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: false })
    assert.equal(runHook(payload('/src/app.ts'), dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

// --- Armed — allowlisted paths pass through ---

test('allows a .test. file edit even when the gate is armed', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: false })
    assert.equal(runHook(payload(path.join(dir, 'src', 'app.test.ts')), dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

test('allows a /.claude/ path edit even when the gate is armed', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: false })
    assert.equal(runHook(payload(statePath(dir)), dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

test('allows a /docs/ path edit even when the gate is armed', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: false })
    assert.equal(runHook(payload(path.join(dir, 'docs', 'diagram.svg')), dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-e2e-always-blocks
test('allows a spec.ts edit under apps/web/e2e/ even when the gate is armed', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: false })
    const r = runHook(payload(path.join(dir, 'apps', 'web', 'e2e', 'admin-students.spec.ts')), dir)
    assert.equal(r.status, 0)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-no-path-normalization
test('blocks a production target reached through an exempt directory via ..', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: false })
    const r = runHook(payload(`${dir}/apps/web/e2e/../app/app/quiz/actions/submit.ts`), dir)
    assert.equal(r.status, 2)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-exempt-dirs-unanchored
test('blocks a production file whose path contains apps/web/e2e/ below another directory', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: false })
    const r = runHook(payload(path.join(dir, 'vendor', 'apps', 'web', 'e2e', 'x.ts')), dir)
    assert.equal(r.status, 2)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-worktrees-exempt
test('blocks a production file inside a .claude/worktrees/ checkout when the gate is armed', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: false })
    const wt = path.join(dir, '.claude', 'worktrees', 'wt')
    mkdirSync(wt, { recursive: true })
    const r = runHook(payload(path.join(wt, 'apps', 'web', 'lib', 'foo.ts')), dir)
    assert.equal(r.status, 2)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-worktree-exempt-dirs-blocked
test('allows a docs edit inside a .claude/worktrees/ checkout when the gate is armed', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: false })
    const wt = path.join(dir, '.claude', 'worktrees', 'wt')
    mkdirSync(wt, { recursive: true })
    assert.equal(runHook(payload(path.join(wt, 'docs', 'x.ts')), dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

test('allows an .md file edit even when the gate is armed', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: false })
    assert.equal(runHook(payload(path.join(dir, 'CONTRIBUTING.md')), dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

// --- Fail-open paths ---

test('fails open on unparseable stdin (exit 0)', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: false })
    assert.equal(runHook('not-json', dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

test('fails open on empty stdin (exit 0)', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: false })
    assert.equal(runHook('', dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

test('never blocks an Agent event when the state file is corrupt', () => {
  const dir = makeDir()
  try {
    writeFileSync(statePath(dir), 'not valid json {', 'utf8')
    assert.equal(dispatch(dir, 'plan-critic').status, 0)
  } finally {
    cleanup(dir)
  }
})

// --- Corrupt state ---

test('still blocks on a corrupt gate state file', () => {
  const dir = makeDir()
  try {
    writeFileSync(statePath(dir), 'not valid json {', 'utf8')
    const r = prodEdit(dir)
    assert.equal(r.status, 2)
    assert.match(r.stderr, /unreadable/)
  } finally {
    cleanup(dir)
  }
})

// --- Repo-root keying ---

// GROUP: review-gate-cwd-keyed
test('blocks an armed production edit when the session cwd is a subdirectory', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: false })
    const sub = path.join(dir, 'apps', 'web')
    mkdirSync(sub, { recursive: true })
    const env = { ...process.env, REVIEW_GATE_ROOT: dir }
    const input = payload(path.join(dir, 'apps', 'web', 'lib', 'foo.ts'))
    const r = runNode('review-gate.js', [HOOK], { input, cwd: sub, timeout: TIMEOUT_MS, env })
    assert.equal(r.status, 2)
  } finally {
    cleanup(dir)
  }
})

// --- Worktrees and exempt files ---

// GROUP: review-gate-agent-worktree-own-branch, review-gate-always-passes, review-gate-worktrees-exempt, review-gate-exempt-dirs-unanchored
test('blocks an armed production edit inside an agent worktree on its own branch', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: false })
    const wt = addWorktree(dir, 'agent-x', 'worktree-agent-x')
    assert.equal(runHook(payload(path.join(wt, 'src', 'a.ts')), dir).status, 2)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-all-worktrees-main-branch, review-gate-ignores-branch
test('allows an edit inside a human worktree whose branch is not under review', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: false })
    const wt = addWorktree(dir, 'human', 'feat/other')
    assert.equal(runHook(payload(path.join(wt, 'src', 'a.ts')), dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-coderabbit-not-exempt, review-gate-exempt-files-unanchored, review-gate-always-passes
test('allows a root .coderabbit.yaml edit but blocks a nested one while armed', () => {
  const dir = makeDir()
  try {
    withState(dir, { [BRANCH]: false })
    assert.equal(runHook(payload(path.join(dir, '.coderabbit.yaml')), dir).status, 0)
    assert.equal(runHook(payload(path.join(dir, 'vendor', '.coderabbit.yaml')), dir).status, 2)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-root-from-dirname, review-gate-agent-worktree-own-branch, review-gate-always-passes, review-gate-worktrees-exempt, review-gate-exempt-dirs-unanchored
test('blocks an armed edit when the hook runs from an agent worktree copy', () => {
  const dir = makeDir()
  try {
    mkdirSync(path.join(dir, '.claude', 'hooks'))
    copyFileSync(HOOK, path.join(dir, '.claude', 'hooks', 'review-gate.js'))
    gitIn(dir, 'add', '.claude/pipeline.json', '.claude/hooks/review-gate.js')
    gitIn(dir, 'commit', '-q', '-m', 'hook')
    withState(dir, { [BRANCH]: false })
    const wt = addWorktree(dir, 'agent-x', 'worktree-agent-x')
    const env = { ...process.env }
    delete env.REVIEW_GATE_ROOT
    const copy = path.join(wt, '.claude', 'hooks', 'review-gate.js')
    const input = payload(path.join(wt, 'src', 'a.ts'))
    const r = runNode('review-gate.js', [copy], { input, cwd: dir, timeout: TIMEOUT_MS, env })
    assert.equal(r.status, 2)
  } finally {
    cleanup(dir)
  }
})
