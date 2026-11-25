#!/usr/bin/env node
// check-review-gate-lock.mjs — commit gate: refuse a commit while the review-gate lock is set.
// Wired at BOTH `pre-commit` and `commit-msg` (lefthook.yml). The pre-commit copy is skipped
// when nothing is staged, so the commit-msg copy is what catches a message-only amend or an
// `--allow-empty` commit — that stage runs on every commit.
//
// The lock is set by a gate-round or conditional dispatch and cleared by a plan-critic dispatch
// (.claude/hooks/review-gate.js). CLAUDE.md step 7 requires plan-critic for a fixup after a review
// round; this is where that requirement is enforced.
//
// Gated at the commit, not at a tool: a PreToolUse matcher fires only on the tool names it
// enumerates (`.claude/settings.json` lists Edit, Write and NotebookEdit), so Bash,
// mcp__terminal__run_in_terminal, Monitor and the user's own editor would each have to be added,
// and an editor cannot be. Every write route reaches `git commit`.
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

// The writer (`review-gate.js`) honours `REVIEW_GATE_ROOT`, so the lock can sit under that root
// rather than this checkout's. Check BOTH: a lock under either refuses the commit. This only ADDS
// a place to look, so the var can never redirect the gate AWAY from a real lock — the split the
// two-sided-gate rule warns about (`.claude/rules/code-style.md` §7). A stale var would need a
// stale lock under its own root to block anything; one pointing nowhere finds nothing.
const roots = [root]
// biome-ignore lint/suspicious/noUndeclaredEnvVars: not a Turborepo task — runs outside turbo.
const redirected = process.env.REVIEW_GATE_ROOT
if (redirected) roots.push(path.resolve(redirected))

if (roots.some((r) => existsSync(path.join(r, '.claude', 'review-gate.lock')))) {
  process.stderr.write(
    'BLOCKED: a review round is open — the review-gate lock is set.\n' +
      'Plan the fixup (validated findings, proposed fix per finding), then dispatch plan-critic.\n' +
      'The plan-critic dispatch clears the lock; /fullpush step 11 clears it after a push.\n',
  )
  process.exit(1)
}

process.exit(0)
