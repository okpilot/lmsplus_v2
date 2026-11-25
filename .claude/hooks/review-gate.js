#!/usr/bin/env node
// review-gate.js — after a review round, blocks production Edit/Write until plan-critic is dispatched.
//
// Wired twice in .claude/settings.json:
//   PostToolUse Agent     a gate-round/conditional dispatch sets the lock; a plan-critic dispatch clears it. Always exits 0.
//   PreToolUse Edit|Write|NotebookEdit blocks (exit 2) a production path while the lock is set.
//     A matcher of letters, digits, `_` and `|` is a list of EXACT tool names, NOT a regex
//     (https://code.claude.com/docs/en/hooks.md) — so `Edit|Write` never matched NotebookEdit and
//     naming it is load-bearing. The CLI matches the matcher against a character class and, on a
//     hit, splits it on `[|,]` and compares names exactly; anything else is an unanchored JS regex,
//     in which `Edit` would also match NotebookEdit. That class is WIDER than the four characters
//     above and varies by event and version — 2.1.332 carries two variants — so derive it instead
//     of trusting a list: `grep -a -o -E '\[a-zA-Z0-9_\|[^]]{0,12}\]\+\$' <the CLI bundle>`.
//     What decides is the character SET, never the `|` alone.
//
// Lock: .claude/review-gate.lock (gitignored). Present = set. One lock for every session and branch.
// /fullpush step 11 deletes it after the push succeeds (.claude/skills/review-gate/agent-workflow.md § Pre-Push Review Gate).
// Any session's plan-critic dispatch clears it; a lock no push clears blocks every session until deleted or the next plan-critic dispatch.
// Blocks non-exempt paths under the project folder, including every `.claude/worktrees/*` checkout.
// A failed lock write is logged to stderr and leaves the lock unset.
// Paths are compared as spelled: files outside the project folder, and a path reaching the project
// through a symlink, are not gated here.
// This hook is the cheap early warning, NOT the gate. A write through Bash, an MCP terminal tool,
// Monitor or the user's own editor never reaches a PreToolUse Edit matcher. The enforcing gate is
// lefthook pre-commit `review-gate-lock` (.claude/hooks/check-review-gate-lock.mjs), which every
// write route reaches via `git commit`.
// BLOCKED: `settings.json`, `pipeline.json`, `gate-briefs.json` and the guard sources — the
// executable wiring. STAYS WRITABLE: a `.md` in any directory, any basename carrying `.test.`
// (guard tests included), `.claude/{rules,skills,commands,agents}/`, `docs/`, `apps/web/e2e/`, a
// `.coderabbit.yaml` at a checkout root, and a `.testkit.mjs` or `.mutations.json` under that
// checkout's own `.claude/hooks/`. doc-updater must write the prose and test-writer must write the
// guard tests and the data that grades them while a round is open, so the binding PROSE policy is
// deliberately NOT protected here — only the wiring is.
// WRITABLE IS NOT COMMITTABLE: these carve-outs are edit-time only. lefthook `pre-commit`
// `review-gate-lock` takes no path filter, so a commit of ANY path is refused while the lock is
// set, exempt ones included, until plan-critic is dispatched (#1824).
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
// `.claude` is NOT exempt wholesale: that let a locked session rewrite review-gate.js,
// settings.json, pipeline.json and gate-briefs.json — the policy being enforced. The four
// directories gate agents legitimately write are listed instead, so a NEW hook file is protected
// by default rather than by remembering to add it.
const EXEMPT_DIRS = [
  path.join('.claude', 'rules'),
  path.join('.claude', 'skills'),
  path.join('.claude', 'commands'),
  path.join('.claude', 'agents'),
  'docs',
  path.join('apps', 'web', 'e2e'),
]
const EXEMPT_FILES = ['.coderabbit.yaml']
const EXEMPT_SUFFIXES = ['.md']
// test-writer's own artefacts BESIDE A GUARD, so they are exempt only under the hooks directory of
// the checkout that holds the path. Unscoped, either suffix would pass anywhere in the tree, so a
// production file renamed to one of them would be writable while a round is open.
// Neither suffix contains `.test.`, so the basename check below does not reach them.
const HOOKS_SUFFIXES = ['.testkit.mjs', '.mutations.json']
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

/** True when `filePath` sits under the `.claude/hooks/` of its OWN checkout (nested paths included). */
function inHooksDir(filePath) {
  return filePath.startsWith(path.resolve(checkoutRoot(filePath), '.claude', 'hooks') + path.sep)
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
function onEdit(rawPath) {
  if (!fs.existsSync(LOCK)) process.exit(0)

  // Fail closed on a path field this hook does not recognise. NotebookEdit's `tool_input` path key
  // is undocumented, so a future write tool can reach here with neither field set; `path.resolve('')`
  // would otherwise resolve to the cwd and allow the write. A real Edit/Write always carries one.
  // The `typeof` half is load-bearing: the reader uses `||`, which yields the first TRUTHY value of
  // any type, so an array or object reaches `path.resolve` and throws ERR_INVALID_ARG_TYPE. That
  // exits 1, which PreToolUse treats as a non-blocking error — the write would land. guard-bash.js
  // refuses the same non-string class; the two must not disagree.
  if (typeof rawPath !== 'string' || !rawPath) {
    block('write with no recognised path field, after a review round.')
  }

  // Collapse `..` segments so an exempt substring cannot mask a production target.
  const filePath = path.resolve(rawPath)

  if (!filePath.startsWith(REPO_ROOT + path.sep)) process.exit(0)
  if (EXEMPT_FILES.some((f) => filePath === path.join(checkoutRoot(filePath), f))) process.exit(0)
  if (
    path.basename(filePath).includes('.test.') ||
    inExemptDir(filePath) ||
    EXEMPT_SUFFIXES.some((s) => filePath.endsWith(s)) ||
    (inHooksDir(filePath) && HOOKS_SUFFIXES.some((s) => filePath.endsWith(s)))
  ) {
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
  // NotebookEdit's path key is not in the official hooks docs; third-party sources say
  // `notebook_path`. Read both and let onEdit fail closed when neither is present.
  onEdit(parsed?.tool_input?.file_path || parsed?.tool_input?.notebook_path || '')
})
