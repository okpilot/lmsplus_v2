#!/usr/bin/env node
/**
 * PreToolUse guard for the Agent tool (Decision 92).
 * Blocks a gate-reviewer brief unless it matches that type's template in
 * `.claude/hooks/gate-briefs.json` EXACTLY, after trimming trailing whitespace off the
 * whole prompt. Only round, PR number, branch, and (implementation-critic only) a plan-file
 * path may vary — `agent-workflow.md § Never steer a gate reviewer`.
 *
 * Claude Code delivers the hook payload on STDIN as JSON:
 *   {"cwd":"...","tool_name":"Agent","tool_input":{"subagent_type":"...","prompt":"...",
 *    "description":"...","isolation":"worktree","model":"...","run_in_background":false}}
 * Reference pattern: .claude/hooks/guard-bash.js (stdin accumulate + parse on 'end').
 */

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

/** Repo root plan paths resolve against — never the stdin `cwd`, which is the orchestrator's
 * own shell directory and has no fixed relationship to the repo. `GUARD_AGENT_BRIEF_ROOT` lets
 * the test suite point this at a throwaway fixture root instead of a real (gitignored) plan
 * file — production callers never set it, so they get the real repo root. */
// biome-ignore lint/suspicious/noUndeclaredEnvVars: not a Turborepo task — runs outside turbo.
const REPO_ROOT = process.env.GUARD_AGENT_BRIEF_ROOT || path.join(__dirname, '..', '..')
const TEMPLATES_PATH = path.join(REPO_ROOT, '.claude', 'hooks', 'gate-briefs.json')

/** Regex-escape a literal chunk of a template. */
function escapeRe(t) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Character classes for each placeholder — `agent-workflow.md`/plan §1. */
const PLACEHOLDER_PATTERNS = {
  round: '(?:\\d+|after-loop)',
  pr: '(?:#\\d+|none)',
  branch: '[A-Za-z0-9._/-]+',
  plan: '[^`]+',
}
const PLACEHOLDER_RE = /\{(round|pr|branch|plan)\}/g

/**
 * Build an anchored regex from a template string. A placeholder repeated in one template
 * binds the same value — the first occurrence is a named group, every later one a backreference.
 */
function buildTemplateRegex(template) {
  const seen = new Set()
  let pattern = '^'
  let lastIndex = 0
  PLACEHOLDER_RE.lastIndex = 0
  let m = PLACEHOLDER_RE.exec(template)
  while (m !== null) {
    pattern += escapeRe(template.slice(lastIndex, m.index))
    const name = m[1]
    if (seen.has(name)) {
      pattern += `\\k<${name}>`
    } else {
      seen.add(name)
      pattern += `(?<${name}>${PLACEHOLDER_PATTERNS[name]})`
    }
    lastIndex = PLACEHOLDER_RE.lastIndex
    m = PLACEHOLDER_RE.exec(template)
  }
  pattern += escapeRe(template.slice(lastIndex))
  pattern += '$'
  return new RegExp(pattern)
}

function allow() {
  process.exit(0) // Allow
}

/** Human-readable cause per `checkBrief` block reason — keeps stderr naming the actual defect
 * instead of always claiming a template mismatch. */
const BLOCK_MESSAGES = {
  mismatch: 'does not match its required template',
  plan: 'names an invalid {plan} path — must be under .work/ or .spec-workflow/specs/, end in .md, contain no "..", and exist on disk',
  branch: 'names a {branch} that is not a local branch (refs/heads/<branch>)',
  isolation: 'requires isolation: "worktree"',
  model: 'requires model "opus" or omitted',
  'worktree-forbidden':
    'must not use isolation: "worktree" — only code-review-skill is dispatched into an isolated worktree (agent-code-review.md § Dispatch); a worktree for any other gated type is cut at origin/master, so its own git diff origin/master...HEAD resolves to zero paths',
}

function block(type, reason, template) {
  process.stderr.write(`BLOCKED: ${type} brief ${BLOCK_MESSAGES[reason]}\n`)
  if (reason === 'mismatch') process.stderr.write(`Expected:\n${template}\n`)
  process.exit(2) // Exit code 2 = block the tool call
}

/** implementation-critic's `{plan}` capture: under `.work/` or `.spec-workflow/specs/`, `.md`,
 * no `..`, existing on disk relative to `REPO_ROOT`. */
function planPathValid(plan) {
  if (typeof plan !== 'string') return false
  if (!/^(\.work|\.spec-workflow\/specs)\/[A-Za-z0-9._/-]+\.md$/.test(plan)) return false
  if (plan.includes('..')) return false
  return [REPO_ROOT, mainCheckoutRoot()].some(
    (root) => root && fs.existsSync(path.join(root, plan)),
  )
}

/** The main checkout — where gitignored `.work/` lives when REPO_ROOT is a linked worktree.
 * `null` on a git fault. */
function mainCheckoutRoot() {
  try {
    const commonDir = execFileSync(
      'git',
      ['-C', REPO_ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    return path.dirname(commonDir)
  } catch {
    return null
  }
}

/** `{branch}` must name an existing local branch — a free-text value could carry steering.
 * A git fault reads as absent, so it blocks. */
function branchExists(branch) {
  try {
    execFileSync(
      'git',
      ['-C', REPO_ROOT, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
      {
        stdio: 'ignore',
      },
    )
    return true
  } catch {
    return false
  }
}

/** Parses the hook's stdin JSON payload. Returns `undefined` on invalid JSON — caller is
 * responsible for the fail-open stderr write and exit. */
function parsePayload(input) {
  try {
    return JSON.parse(input)
  } catch {
    return undefined
  }
}

/** Validates one Agent-tool brief against its gated template (`templates[subagentType]`).
 * Returns `null` when the call is allowed (non-gated type, or every check passes), or
 * `{ reason, template }` when it must be blocked — `reason` is one of the `BLOCK_MESSAGES` keys. */
function checkBrief(toolInput, templates) {
  const subagentType = toolInput?.subagent_type
  const template = templates[subagentType]
  if (typeof template !== 'string') return null // not a gated type

  const rawPrompt = toolInput?.prompt
  const prompt = typeof rawPrompt === 'string' ? rawPrompt.trimEnd() : ''
  const re = buildTemplateRegex(template)
  const m = re.exec(prompt)
  if (!m) return { reason: 'mismatch', template }

  if (subagentType === 'implementation-critic') {
    const plan = m.groups?.plan
    if (!planPathValid(plan)) return { reason: 'plan', template }
  }
  if (!branchExists(m.groups?.branch)) return { reason: 'branch', template }

  const reason = dispatchReason(subagentType, toolInput)
  return reason ? { reason, template } : null
}

/** Only code-review-skill is dispatched into a worktree (agent-code-review.md § Dispatch) — it
 * is cut at origin/master, and every OTHER gated type reviews origin/master...HEAD, which
 * resolves to zero paths there. Returns a `BLOCK_MESSAGES` key, or `null`. */
function dispatchReason(subagentType, toolInput) {
  if (subagentType !== 'code-review-skill') {
    return toolInput?.isolation === 'worktree' ? 'worktree-forbidden' : null
  }
  if (toolInput?.isolation !== 'worktree') return 'isolation'
  const model = toolInput?.model
  if (model !== undefined && model !== 'opus') return 'model'
  return null
}

let input = ''
let oversizedPayload = false
process.stdin.setEncoding('utf8')
process.stdin.on('error', (err) => {
  process.stderr.write(`[guard-agent-brief] stdin error — allowing: ${err.message}\n`, () =>
    process.exit(0),
  )
})
process.stdin.on('data', (chunk) => {
  input += chunk
  if (input.length > 1_000_000 && !oversizedPayload) {
    oversizedPayload = true
    process.stdin.destroy()
    // Fail closed: a gated brief is under 1KB, so only padding reaches 1MB.
    process.stderr.write('BLOCKED: Agent payload exceeds 1MB\n', () => process.exit(2))
  }
})
process.stdin.on('end', () => {
  if (oversizedPayload) return
  const payload = parsePayload(input)
  if (payload === undefined) {
    process.stderr.write('[guard-agent-brief] unparseable hook payload — allowing\n', () =>
      process.exit(0),
    )
    return
  }

  const toolInput = payload?.tool_input
  const subagentType = toolInput?.subagent_type
  if (typeof subagentType !== 'string') return allow()

  let templatesDoc
  try {
    templatesDoc = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'))
  } catch (err) {
    // Fail closed: with no templates, a gated brief cannot be checked.
    process.stderr.write(`BLOCKED: cannot read ${TEMPLATES_PATH}: ${err.message}\n`)
    process.exit(2)
  }
  const templates = templatesDoc?.templates ?? {}

  const result = checkBrief(toolInput, templates)
  if (result) return block(subagentType, result.reason, result.template)
  return allow()
})
