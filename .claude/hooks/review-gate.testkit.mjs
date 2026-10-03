// Shared fixtures for the review-gate suite (review-gate.test.mjs).
// Not a suite itself, no ci.yml step of its own; pattern: guard-agent-brief.testkit.mjs.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runNode } from './spawn.testkit.mjs'
export const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'review-gate.js')

const FIXTURE_PIPELINE = JSON.stringify({
  agents: {
    'semantic-reviewer': { role: 'gate-round' },
    'red-team': { role: 'conditional' },
    'plan-critic': { role: 'pre-execution' },
  },
})

/** Temp dir holding a fixture pipeline.json. */
export function makeDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'review-gate-test-'))
  mkdirSync(path.join(dir, '.claude'))
  writeFileSync(path.join(dir, '.claude', 'pipeline.json'), FIXTURE_PIPELINE, 'utf8')
  return dir
}

/** `git` in the temp repo `dir`, with a throwaway identity. */
export const gitIn = (dir, ...args) =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    stdio: 'ignore',
  })

/** Temp git repo with one commit, holding a fixture pipeline.json. */
export function makeRepo() {
  const dir = makeDir()
  gitIn(dir, 'init', '-q')
  gitIn(dir, 'commit', '-q', '--allow-empty', '-m', 'init')
  return dir
}

const lockPath = (dir) => path.join(dir, '.claude', 'review-gate.lock')

/** Set the lock. */
export const arm = (dir) => writeFileSync(lockPath(dir), '')

export const isArmed = (dir) => existsSync(lockPath(dir))

/** Remove the temp dir. */
export function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true })
}

export const TIMEOUT_MS = 5_000

/**
 * Spawn the hook with the given stdin, running in cwd so the hook finds the gate state.
 *
 * runNode throws NO VERDICT on a signal, a timeout or a failed spawn — `status: null` otherwise
 * reaches `assert.equal(r.status, 2)` and reports a kill as a wrong exit code.
 */
export function runHook(stdin, cwd) {
  const env = { ...process.env, REVIEW_GATE_ROOT: cwd }
  return runNode('review-gate.js', [HOOK], { input: stdin, cwd, timeout: TIMEOUT_MS, env })
}

/** Hook stdin payload for an Edit/Write of filePath. */
export function payload(filePath) {
  return JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } })
}

/** Run a PostToolUse Agent event for `subagentType` (none when omitted). */
export function dispatch(dir, subagentType) {
  const toolInput = subagentType ? { subagent_type: subagentType } : {}
  return runHook(JSON.stringify({ tool_name: 'Agent', tool_input: toolInput }), dir)
}

/** Edit of a production file inside the repo. */
export const prodEdit = (dir) =>
  runHook(payload(path.join(dir, 'apps', 'web', 'lib', 'foo.ts')), dir)

/** Add a worktree `name` under .claude/worktrees/ on a new branch; returns its path. */
export function addWorktree(dir, name, branch) {
  const wt = path.join(dir, '.claude', 'worktrees', name)
  gitIn(dir, 'worktree', 'add', '-q', '-b', branch, wt)
  return wt
}
