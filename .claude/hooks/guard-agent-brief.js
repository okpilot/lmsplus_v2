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

const fs = require('node:fs')
const path = require('node:path')

const TEMPLATES_PATH = path.join(__dirname, 'gate-briefs.json')

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

function block(type, template) {
  process.stderr.write(
    `BLOCKED: ${type} brief does not match its required template\nExpected:\n${template}\n`,
  )
  process.exit(2) // Exit code 2 = block the tool call
}

/** implementation-critic's `{plan}` capture: under `.work/` or `.spec-workflow/specs/`, `.md`,
 * no `..`, existing on disk relative to the stdin `cwd`. */
function planPathValid(plan, cwd) {
  if (typeof plan !== 'string') return false
  if (!/^(\.work|\.spec-workflow\/specs)\/[A-Za-z0-9._/-]+\.md$/.test(plan)) return false
  if (plan.includes('..')) return false
  const resolved = path.join(typeof cwd === 'string' ? cwd : process.cwd(), plan)
  return fs.existsSync(resolved)
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
    process.stderr.write(
      '[guard-agent-brief] payload exceeds 1MB — allowing (unparseable-payload policy)\n',
      () => process.exit(0),
    )
  }
})
process.stdin.on('end', () => {
  if (oversizedPayload) return
  let payload
  try {
    payload = JSON.parse(input)
  } catch {
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
    process.stderr.write(
      `[guard-agent-brief] cannot read ${TEMPLATES_PATH} — allowing: ${err.message}\n`,
    )
    return allow()
  }
  const templates = templatesDoc?.templates ?? {}
  const template = templates[subagentType]
  if (typeof template !== 'string') return allow() // not a gated type

  const rawPrompt = toolInput?.prompt
  const prompt = typeof rawPrompt === 'string' ? rawPrompt.replace(/\s+$/, '') : ''
  const re = buildTemplateRegex(template)
  const m = re.exec(prompt)
  if (!m) return block(subagentType, template)

  if (subagentType === 'implementation-critic') {
    const plan = m.groups?.plan
    if (!planPathValid(plan, payload?.cwd)) return block(subagentType, template)
  }

  if (subagentType === 'code-review-skill') {
    if (toolInput?.isolation !== 'worktree') return block(subagentType, template)
    const model = toolInput?.model
    if (model !== undefined && model !== 'opus') return block(subagentType, template)
  }

  return allow()
})
