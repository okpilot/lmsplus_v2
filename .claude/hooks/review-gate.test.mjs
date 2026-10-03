// Unit test for the review-gate hook (PostToolUse Agent + PreToolUse Edit|Write). Run:
//   node .claude/hooks/review-gate.test.mjs
// Spawns the real hook as a child process and feeds the Claude Code hook payload
// on STDIN — the channel the harness actually uses — so these tests pin the
// input contract and gate-state behaviour, not just the pattern matching.
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import {
  addWorktree,
  arm,
  cleanup,
  dispatch,
  gitIn,
  HOOK,
  isArmed,
  makeDir,
  makeRepo,
  payload,
  prodEdit,
  runHook,
  TIMEOUT_MS,
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
    arm(dir)
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
test('sets the lock when a gate-round agent is dispatched', () => {
  const dir = makeDir()
  try {
    assert.equal(dispatch(dir, 'semantic-reviewer').status, 0)
    assert.equal(isArmed(dir), true)
    assert.equal(prodEdit(dir).status, 2)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-no-arm
test('sets the lock when a conditional agent is dispatched', () => {
  const dir = makeDir()
  try {
    assert.equal(dispatch(dir, 'red-team').status, 0)
    assert.equal(prodEdit(dir).status, 2)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-no-unlock, review-gate-plan-critic-arms
test('clears the lock when plan-critic is dispatched after a round', () => {
  const dir = makeDir()
  try {
    dispatch(dir, 'semantic-reviewer')
    assert.equal(dispatch(dir, 'plan-critic').status, 0)
    assert.equal(prodEdit(dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-no-arm
test('sets the lock again when the next round dispatches a reviewer', () => {
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

// GROUP: review-gate-arms-any-role
test('leaves the state unchanged when a non-gate agent is dispatched', () => {
  const dir = makeDir()
  try {
    assert.equal(dispatch(dir, 'Explore').status, 0)
    assert.equal(dispatch(dir).status, 0)
    assert.equal(isArmed(dir), false)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-plan-critic-arms
test('writes no state when plan-critic is dispatched before any round', () => {
  const dir = makeDir()
  try {
    assert.equal(dispatch(dir, 'plan-critic').status, 0)
    assert.equal(isArmed(dir), false)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-outside-repo-blocked
test('allows a production file outside the repo root when the gate is armed', () => {
  const dir = makeDir()
  try {
    arm(dir)
    assert.equal(runHook(payload('/src/app.ts'), dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

// --- Armed — allowlisted paths pass through ---

test('allows a .test. file edit even when the gate is armed', () => {
  const dir = makeDir()
  try {
    arm(dir)
    assert.equal(runHook(payload(path.join(dir, 'src', 'app.test.ts')), dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

test('allows a /.claude/ path edit even when the gate is armed', () => {
  const dir = makeDir()
  try {
    arm(dir)
    assert.equal(runHook(payload(path.join(dir, '.claude', 'x')), dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

test('allows a /docs/ path edit even when the gate is armed', () => {
  const dir = makeDir()
  try {
    arm(dir)
    assert.equal(runHook(payload(path.join(dir, 'docs', 'diagram.svg')), dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-e2e-always-blocks
test('allows a spec.ts edit under apps/web/e2e/ even when the gate is armed', () => {
  const dir = makeDir()
  try {
    arm(dir)
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
    arm(dir)
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
    arm(dir)
    const r = runHook(payload(path.join(dir, 'vendor', 'apps', 'web', 'e2e', 'x.ts')), dir)
    assert.equal(r.status, 2)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-worktree-exempt-dirs-blocked
test('allows a docs edit inside a .claude/worktrees/ checkout when the gate is armed', () => {
  const dir = makeDir()
  try {
    arm(dir)
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
    arm(dir)
    assert.equal(runHook(payload(path.join(dir, 'CONTRIBUTING.md')), dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

// --- Fail-open paths ---

test('fails open on unparseable stdin (exit 0)', () => {
  const dir = makeDir()
  try {
    arm(dir)
    assert.equal(runHook('not-json', dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

test('fails open on empty stdin (exit 0)', () => {
  const dir = makeDir()
  try {
    arm(dir)
    assert.equal(runHook('', dir).status, 0)
  } finally {
    cleanup(dir)
  }
})

// --- Worktrees and exempt files ---

// GROUP: review-gate-always-passes, review-gate-worktrees-exempt, review-gate-exempt-dirs-unanchored
test('blocks a production edit in any worktree under .claude/worktrees while locked', () => {
  const dir = makeDir()
  try {
    arm(dir)
    for (const name of ['agent-x', 'human']) {
      const wt = path.join(dir, '.claude', 'worktrees', name)
      mkdirSync(wt, { recursive: true })
      assert.equal(runHook(payload(path.join(wt, 'src', 'a.ts')), dir).status, 2)
    }
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-coderabbit-not-exempt, review-gate-exempt-files-unanchored, review-gate-always-passes
test('allows a root .coderabbit.yaml edit but blocks a nested one while armed', () => {
  const dir = makeDir()
  try {
    arm(dir)
    assert.equal(runHook(payload(path.join(dir, '.coderabbit.yaml')), dir).status, 0)
    assert.equal(runHook(payload(path.join(dir, 'vendor', '.coderabbit.yaml')), dir).status, 2)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-root-from-dirname, review-gate-always-passes, review-gate-worktrees-exempt, review-gate-exempt-dirs-unanchored
test('blocks an armed edit when the hook runs from an agent worktree copy', () => {
  const dir = makeRepo()
  try {
    mkdirSync(path.join(dir, '.claude', 'hooks'))
    copyFileSync(HOOK, path.join(dir, '.claude', 'hooks', 'review-gate.js'))
    gitIn(dir, 'add', '.claude/pipeline.json', '.claude/hooks/review-gate.js')
    gitIn(dir, 'commit', '-q', '-m', 'hook')
    arm(dir)
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

// GROUP: review-gate-agent-error-silent
test('logs a failed lock update and leaves the lock unset when pipeline.json is unreadable', () => {
  const dir = makeDir()
  try {
    writeFileSync(path.join(dir, '.claude', 'pipeline.json'), '{', 'utf8')
    const r = dispatch(dir, 'semantic-reviewer')
    assert.equal(r.status, 0)
    assert.match(r.stderr, /state update failed/)
    assert.equal(isArmed(dir), false)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-fallback-root-wrong, review-gate-no-arm
test('sets the lock beside the hook when git cannot resolve the repo', () => {
  const dir = makeDir()
  try {
    mkdirSync(path.join(dir, '.claude', 'hooks'))
    const copy = path.join(dir, '.claude', 'hooks', 'review-gate.js')
    copyFileSync(HOOK, copy)
    const env = { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(dir) }
    for (const k of ['REVIEW_GATE_ROOT', 'GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE'])
      delete env[k]
    const input = JSON.stringify({
      tool_name: 'Agent',
      tool_input: { subagent_type: 'semantic-reviewer' },
    })
    const r = runNode('review-gate.js', [copy], { input, cwd: dir, timeout: TIMEOUT_MS, env })
    assert.equal(r.status, 0)
    assert.equal(isArmed(dir), true)
  } finally {
    cleanup(dir)
  }
})
