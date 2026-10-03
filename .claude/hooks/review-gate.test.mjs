// Unit test for the review-gate hook (PostToolUse Agent + PreToolUse Edit|Write). Run:
//   node .claude/hooks/review-gate.test.mjs
// Spawns the real hook as a child process and feeds the Claude Code hook payload
// on STDIN — the channel the harness actually uses — so these tests pin the
// input contract and gate-state behaviour, not just the pattern matching.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runNode } from './spawn.testkit.mjs'

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'review-gate.js')
const BRANCH = 'feat/work'

const FIXTURE_PIPELINE = JSON.stringify({
  agents: {
    'semantic-reviewer': { role: 'gate-round' },
    'red-team': { role: 'conditional' },
    'plan-critic': { role: 'pre-execution' },
  },
})

/** Temp git repo on branch `branch`, holding a fixture pipeline.json. */
function makeDir(branch = BRANCH) {
  const dir = mkdtempSync(path.join(tmpdir(), 'review-gate-test-'))
  mkdirSync(path.join(dir, '.claude'))
  writeFileSync(path.join(dir, '.claude', 'pipeline.json'), FIXTURE_PIPELINE, 'utf8')
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
  git('init', '-q')
  git('checkout', '-q', '-b', branch)
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init')
  return dir
}

const statePath = (dir) => path.join(dir, '.claude', 'review-gate.json')

/** Write state: `branches` maps branch name to its `unlocked` flag. */
function withState(dir, branches) {
  const entries = Object.entries(branches).map(([name, unlocked]) => [name, { unlocked }])
  writeFileSync(statePath(dir), JSON.stringify({ branches: Object.fromEntries(entries) }), 'utf8')
}

const readState = (dir) => JSON.parse(readFileSync(statePath(dir), 'utf8'))

/** Remove the temp dir. */
function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true })
}

const TIMEOUT_MS = 5_000

/**
 * Spawn the hook with the given stdin, running in cwd so the hook finds the gate state.
 *
 * runNode throws NO VERDICT on a signal, a timeout or a failed spawn — `status: null` otherwise
 * reaches `assert.equal(r.status, 2)` and reports a kill as a wrong exit code.
 */
function runHook(stdin, cwd) {
  const env = { ...process.env, REVIEW_GATE_ROOT: cwd }
  return runNode('review-gate.js', [HOOK], { input: stdin, cwd, timeout: TIMEOUT_MS, env })
}

/** Hook stdin payload for an Edit/Write of filePath. */
function payload(filePath) {
  return JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } })
}

/** Run a PostToolUse Agent event for `subagentType` (none when omitted). */
function dispatch(dir, subagentType) {
  const toolInput = subagentType ? { subagent_type: subagentType } : {}
  return runHook(JSON.stringify({ tool_name: 'Agent', tool_input: toolInput }), dir)
}

/** Edit of a production file inside the repo. */
const prodEdit = (dir) => runHook(payload(path.join(dir, 'apps', 'web', 'lib', 'foo.ts')), dir)

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
