#!/usr/bin/env node
// check-review-gate-lock.mjs — pre-commit gate: refuse a commit while the review-gate lock is set.
//
// The lock is set by a gate-round or conditional dispatch and cleared by a plan-critic dispatch
// (.claude/hooks/review-gate.js). CLAUDE.md step 7 requires plan-critic for a fixup after a review
// round; this is where that requirement is enforced.
//
// Gated at the commit, not at a tool: PreToolUse covers one tool name at a time, so Bash,
// NotebookEdit, mcp__terminal__run_in_terminal, Monitor and the user's own editor each need their
// own matcher. Every write route reaches `git commit`.
//
// Fails closed: an unresolvable git common dir refuses the commit rather than skipping the check.
// Escape hatch is LEFTHOOK=0 or --no-verify, both explicit and visible in the shell history.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/** Main checkout root, via git's common dir so a worktree resolves the one shared lock. */
function mainCheckoutRoot() {
  const gitDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  if (!gitDir) throw new Error('git printed no common dir')
  return path.dirname(gitDir)
}

let root
try {
  root = mainCheckoutRoot()
} catch (err) {
  process.stderr.write(
    `BLOCKED: cannot resolve the git common dir, so the review-gate lock cannot be read: ${err.message}\n` +
      'Commit refused rather than skipped. Run inside the repository, or dispatch plan-critic and retry.\n',
  )
  process.exit(1)
}

if (existsSync(path.join(root, '.claude', 'review-gate.lock'))) {
  process.stderr.write(
    'BLOCKED: a review round is open — the review-gate lock is set.\n' +
      'Plan the fixup (validated findings, proposed fix per finding), then dispatch plan-critic.\n' +
      'The plan-critic dispatch clears the lock; /fullpush step 11 clears it after a push.\n',
  )
  process.exit(1)
}

process.exit(0)
