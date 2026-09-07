#!/usr/bin/env node
// Invariant: every .claude/agents/*.md declares tools: in its frontmatter.
// test-writer carries BOTH Write and Edit; every other agent carries NEITHER.
// Checking for either tool alone is too weak in both directions: it passes an
// agent holding only Edit, and passes a test-writer that has silently lost Write.
// A new agent without tools: inherits the full Write/Edit toolset by default,
// violating the access-control model established in commit 1b4ee552.
//
// Run:  node .claude/agents/agent-tools.test.mjs
// Override dir for mutation testing:
//   node .claude/agents/agent-tools.test.mjs /tmp/scratch-agents

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const agentsDir = process.argv[2] ?? __dir

const mdFiles = readdirSync(agentsDir).filter((f) => f.endsWith('.md'))
let passed = 0
let failed = 0

function pass(msg) {
  console.log(`PASS: ${msg}`)
  passed++
}

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  failed++
}

// ── per-file checks ──────────────────────────────────────────────────────────
const WRITER = 'test-writer.md'
const offenders = []
let writerTools = null

for (const file of mdFiles) {
  const content = readFileSync(join(agentsDir, file), 'utf8')
  const lines = content.split('\n')

  if (lines[0] !== '---') {
    fail(`${file}: no YAML frontmatter opening ---`)
    continue
  }
  const fmEnd = lines.indexOf('---', 1)
  if (fmEnd === -1) {
    fail(`${file}: unclosed YAML frontmatter (no closing ---)`)
    continue
  }

  const frontmatter = lines.slice(1, fmEnd).join('\n')
  const toolsMatch = frontmatter.match(/^tools:\s*(.+)$/m)
  if (!toolsMatch) {
    fail(`${file}: missing tools: key in frontmatter`)
    continue
  }
  pass(`${file}: has tools: key`)

  const tools = toolsMatch[1].split(',').map((t) => t.trim())
  const hasWrite = tools.includes('Write')
  const hasEdit = tools.includes('Edit')

  if (file === WRITER) {
    writerTools = { hasWrite, hasEdit }
  } else if (hasWrite || hasEdit) {
    const held = [hasWrite && 'Write', hasEdit && 'Edit'].filter(Boolean).join('+')
    offenders.push(`${file} (${held})`)
  }
}

// ── global invariant: WRITER holds BOTH, every other agent holds NEITHER ─────
if (writerTools === null) {
  fail(`${WRITER} not found in ${agentsDir}`)
} else if (writerTools.hasWrite && writerTools.hasEdit) {
  pass(`${WRITER} carries both Write and Edit`)
} else {
  const missing = [!writerTools.hasWrite && 'Write', !writerTools.hasEdit && 'Edit']
    .filter(Boolean)
    .join(' and ')
  fail(`${WRITER} must carry both Write and Edit; missing: ${missing}`)
}

if (offenders.length === 0) {
  pass(`no agent other than ${WRITER} carries Write or Edit`)
} else {
  fail(`only ${WRITER} may carry Write/Edit; also found: ${offenders.join(', ')}`)
}

console.log(`\nResults: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
