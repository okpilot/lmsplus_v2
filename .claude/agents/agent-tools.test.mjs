#!/usr/bin/env node
// Invariant: every .claude/agents/*.md declares tools: in its frontmatter.
// Exactly one agent (test-writer) carries Write/Edit — nine are read-only.
// A new agent without tools: inherits the full Write/Edit toolset by default,
// violating the access-control model established in commit 1b4ee552.
//
// Run:  node .claude/agents/agent-tools.test.mjs
// Override dir for mutation testing:
//   node .claude/agents/agent-tools.test.mjs /tmp/scratch-agents

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
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
const writableAgents = []

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
  if (tools.includes('Write') || tools.includes('Edit')) {
    writableAgents.push(file)
  }
}

// ── global invariant: exactly one writer ─────────────────────────────────────
if (writableAgents.length === 0) {
  fail('no agent has Write/Edit — test-writer.md should have it')
} else if (writableAgents.length === 1 && writableAgents[0] === 'test-writer.md') {
  pass('exactly one agent has Write/Edit: test-writer.md')
} else {
  fail(
    `expected only test-writer.md to carry Write/Edit; got: ${writableAgents.join(', ')}`,
  )
}

console.log(`\nResults: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
