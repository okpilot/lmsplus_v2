#!/usr/bin/env node
// review-gate.js — after a review round, blocks production Edit/Write until plan-critic is dispatched.
//
// Wired twice in .claude/settings.json:
//   PostToolUse Agent     a gate-round/conditional dispatch arms the current branch;
//                         a plan-critic dispatch unlocks it. Always exits 0.
//   PreToolUse Edit|Write blocks (exit 2) a production path while the branch is armed.
//
// State .claude/review-gate.json (gitignored): { "branches": { "<name>": { "unlocked": <bool> } } }
// Edits under `.claude/worktrees/agent-*` are gated by the main checkout's branch entry.
// `.coderabbit.yaml` at a checkout root is exempt, like `.claude/` and `docs/`.
// Roles come from .claude/pipeline.json `agents.<type>.role`. Bash redirects bypass the gate.

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

/** `REVIEW_GATE_ROOT` points the test suite at a fixture pipeline.json. */
// biome-ignore lint/suspicious/noUndeclaredEnvVars: not a Turborepo task — runs outside turbo.
const REPO_ROOT = process.env.REVIEW_GATE_ROOT || mainCheckoutRoot()
const PIPELINE_PATH = path.join(REPO_ROOT, '.claude', 'pipeline.json')
const ARMING_ROLES = new Set(['gate-round', 'conditional'])
const GATE_FILE = path.join(REPO_ROOT, '.claude', 'review-gate.json')
const EXEMPT_DIRS = ['.claude', 'docs', path.join('apps', 'web', 'e2e')]
const EXEMPT_FILES = ['.coderabbit.yaml']
const WORKTREES_DIR = path.resolve(REPO_ROOT, '.claude', 'worktrees') + path.sep

/** The checkout holding `filePath`: its worktree under .claude/worktrees/, else the main tree. */
function checkoutRoot(filePath) {
  if (!filePath.startsWith(WORKTREES_DIR)) return REPO_ROOT
  return WORKTREES_DIR + filePath.slice(WORKTREES_DIR.length).split(path.sep)[0]
}

/** Checkout whose branch gates `filePath`: an agent worktree answers to the main checkout. */
function gateBranchRoot(filePath) {
  const root = checkoutRoot(filePath)
  return path.basename(root).startsWith('agent-') ? REPO_ROOT : root
}

/** True when `filePath` sits in an exempt directory of its own checkout. */
function inExemptDir(filePath) {
  const root = checkoutRoot(filePath)
  return EXEMPT_DIRS.some((dir) => filePath.startsWith(path.resolve(root, dir) + path.sep))
}

/** Current branch of the checkout at `root`; `null` on a git fault. */
function readBranch(root) {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

/** Parsed gate state; throws when the file is missing, unparseable or mis-shaped. */
function loadState() {
  const state = JSON.parse(fs.readFileSync(GATE_FILE, 'utf8'))
  if (typeof state?.branches !== 'object' || state.branches === null) throw new Error('bad shape')
  return state
}

/** Atomic state write. */
function saveState(state) {
  fs.mkdirSync(path.dirname(GATE_FILE), { recursive: true })
  const tmp = `${GATE_FILE}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state), 'utf8')
  fs.renameSync(tmp, GATE_FILE)
}

/** True when pipeline.json gives `subagentType` an arming role. */
function isArmingRole(subagentType) {
  const pipeline = JSON.parse(fs.readFileSync(PIPELINE_PATH, 'utf8'))
  return ARMING_ROLES.has(pipeline.agents?.[subagentType]?.role)
}

/** Apply an accepted Agent dispatch to the gate state. */
function onAgent(subagentType) {
  const branch = readBranch(REPO_ROOT)
  if (!branch) return
  if (subagentType === 'plan-critic') {
    if (!fs.existsSync(GATE_FILE)) return
    let state
    try {
      state = loadState()
    } catch {
      // Drops other branches' entries: the old file was unreadable anyway.
      state = { branches: { [branch]: { unlocked: true } } }
    }
    if (state.branches[branch]) state.branches[branch].unlocked = true
    saveState(state)
    return
  }
  if (!subagentType || !isArmingRole(subagentType)) return
  let state = { branches: {} }
  try {
    state = loadState()
  } catch {}
  state.branches[branch] = { unlocked: false }
  saveState(state)
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
  if (!fs.existsSync(GATE_FILE)) process.exit(0)

  // Collapse `..` segments so an exempt substring cannot mask a production target.
  filePath = path.resolve(filePath)

  if (!filePath.startsWith(REPO_ROOT + path.sep)) process.exit(0)
  if (EXEMPT_FILES.some((f) => filePath === path.join(checkoutRoot(filePath), f))) process.exit(0)
  if (filePath.includes('.test.') || inExemptDir(filePath) || filePath.endsWith('.md')) {
    process.exit(0)
  }

  let state
  try {
    state = loadState()
  } catch {
    block('production edit while the review gate state is unreadable.')
  }
  const branch = readBranch(gateBranchRoot(filePath))
  if (!branch) block('production edit while the branch cannot be read.')
  const entry = state.branches[branch]
  if (!entry) process.exit(0)
  if (entry.unlocked === true) process.exit(0)
  block(`production edit after a review round on branch ${branch}.`)
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
