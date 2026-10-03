#!/usr/bin/env node
// review-gate.js — after a review round, blocks production Edit/Write until plan-critic is dispatched.
//
// Wired twice in .claude/settings.json:
//   PostToolUse Agent     a gate-round/conditional dispatch sets the lock; a plan-critic dispatch clears it. Always exits 0.
//   PreToolUse Edit|Write blocks (exit 2) a production path while the lock is set.
//
// Lock: .claude/review-gate.lock (gitignored). Present = set. One lock for every session and branch.
// /fullpush step 11 deletes it after the push succeeds (agent-workflow.md § Pre-Push Review Gate).
// Blocks non-exempt paths under the project folder, including every `.claude/worktrees/*` checkout.
// A failed lock write is logged to stderr and leaves the lock unset.
// Paths are compared as spelled: files outside the project folder, a path reaching the project
// through a symlink, and Bash redirects are not gated.
// `.coderabbit.yaml` at a checkout root is exempt, like `.claude/` and `docs/`.
// Roles come from .claude/pipeline.json `agents.<type>.role`.

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

/** Main checkout root, found through git's common dir so a worktree copy of this hook resolves it too. */
function mainCheckoutRoot() {
  try {
    const gitDir = execFileSync(
      'git',
      ['-C', __dirname, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    return path.dirname(gitDir)
  } catch {
    return path.join(__dirname, '..', '..')
  }
}

/** `REVIEW_GATE_ROOT` points the test suite at a fixture pipeline.json. Resolved: git prints `/` on Windows. */
// biome-ignore lint/suspicious/noUndeclaredEnvVars: not a Turborepo task — runs outside turbo.
const REPO_ROOT = path.resolve(process.env.REVIEW_GATE_ROOT || mainCheckoutRoot())
const PIPELINE_PATH = path.join(REPO_ROOT, '.claude', 'pipeline.json')
const ARMING_ROLES = new Set(['gate-round', 'conditional'])
const LOCK = path.join(REPO_ROOT, '.claude', 'review-gate.lock')
const EXEMPT_DIRS = ['.claude', 'docs', path.join('apps', 'web', 'e2e')]
const EXEMPT_FILES = ['.coderabbit.yaml']
const WORKTREES_DIR = path.resolve(REPO_ROOT, '.claude', 'worktrees') + path.sep

/** The checkout holding `filePath`: its worktree under .claude/worktrees/, else the main tree. */
function checkoutRoot(filePath) {
  if (!filePath.startsWith(WORKTREES_DIR)) return REPO_ROOT
  return WORKTREES_DIR + filePath.slice(WORKTREES_DIR.length).split(path.sep)[0]
}

/** True when `filePath` sits in an exempt directory of its own checkout. */
function inExemptDir(filePath) {
  const root = checkoutRoot(filePath)
  return EXEMPT_DIRS.some((dir) => filePath.startsWith(path.resolve(root, dir) + path.sep))
}

/** True when pipeline.json gives `subagentType` an arming role. */
function isArmingRole(subagentType) {
  const pipeline = JSON.parse(fs.readFileSync(PIPELINE_PATH, 'utf8'))
  return ARMING_ROLES.has(pipeline.agents?.[subagentType]?.role)
}

/** Apply an accepted Agent dispatch to the lock. */
function onAgent(subagentType) {
  if (subagentType === 'plan-critic') {
    fs.rmSync(LOCK, { force: true })
    return
  }
  if (!isArmingRole(subagentType)) return
  fs.writeFileSync(LOCK, '')
}

/** Exit 2 with `reason`. */
function block(reason) {
  process.stderr.write(
    `BLOCKED: ${reason}\nPlan the fixup (validated findings, proposed fix per finding), then dispatch plan-critic.\n`,
  )
  process.exit(2)
}

/** Edit/Write check for `filePath`. */
function onEdit(filePath) {
  if (!fs.existsSync(LOCK)) process.exit(0)

  // Collapse `..` segments so an exempt substring cannot mask a production target.
  filePath = path.resolve(filePath)

  if (!filePath.startsWith(REPO_ROOT + path.sep)) process.exit(0)
  if (EXEMPT_FILES.some((f) => filePath === path.join(checkoutRoot(filePath), f))) process.exit(0)
  if (filePath.includes('.test.') || inExemptDir(filePath) || filePath.endsWith('.md')) {
    process.exit(0)
  }

  block('production edit after a review round.')
}

let input = ''
process.stdin.setEncoding('utf8')
// A stream error would otherwise exit 1 (undocumented for PreToolUse hooks) with no
// stderr signal — make the fail-open explicit and observable instead.
process.stdin.on('error', (err) => {
  process.stderr.write(`[review-gate] stdin error — allowing: ${err.message}\n`, () =>
    process.exit(0),
  )
})
process.stdin.on('data', (chunk) => {
  input += chunk
})
process.stdin.on('end', () => {
  let parsed
  try {
    parsed = JSON.parse(input)
  } catch {
    process.exit(0) // Can't parse input, allow
  }
  if (parsed?.tool_name === 'Agent') {
    try {
      onAgent(parsed.tool_input?.subagent_type)
    } catch (err) {
      process.stderr.write(`[review-gate] state update failed: ${err.message}\n`)
    }
    process.exit(0)
  }
  onEdit(parsed?.tool_input?.file_path || '')
})
