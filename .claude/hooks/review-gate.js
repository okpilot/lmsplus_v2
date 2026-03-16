#!/usr/bin/env node
// review-gate.js — Blocks production file edits when reviewer findings are pending validation.
//
// Flow:
// 1. Post-commit agents find ISSUE/CRITICAL → orchestrator writes .claude/review-gate.json
// 2. This hook fires on Edit/Write → checks if gate file exists → blocks production edits
// 3. Orchestrator validates findings → deletes gate file → edits unlocked
//
// Gate file format (.claude/review-gate.json):
// { "findings": [{ "agent": "semantic-reviewer", "severity": "ISSUE", "file": "foo.ts", "summary": "..." }] }

const fs = require('node:fs')
const path = require('node:path')

const GATE_FILE = path.join(process.cwd(), '.claude', 'review-gate.json')

// Read stdin (tool input JSON)
let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  input += chunk
})
process.stdin.on('end', () => {
  let filePath = ''
  try {
    const parsed = JSON.parse(input)
    filePath = parsed.tool_input?.file_path || ''
  } catch {
    process.exit(0) // Can't parse input, allow
  }

  // No gate file = no restrictions
  if (!fs.existsSync(GATE_FILE)) {
    process.exit(0)
  }

  // Allow edits to non-production files
  if (
    filePath.includes('.test.') ||
    filePath.includes('/.claude/') ||
    filePath.includes('\\.claude\\') ||
    filePath.includes('/docs/') ||
    filePath.includes('\\docs\\') ||
    filePath.endsWith('.md')
  ) {
    process.exit(0)
  }

  // Production file edit while gate is active — block it
  let findings = ''
  try {
    const gate = JSON.parse(fs.readFileSync(GATE_FILE, 'utf8'))
    findings = gate.findings.map((f) => `  - [${f.severity}] ${f.agent}: ${f.summary}`).join('\n')
  } catch {
    findings = '  (could not parse gate file)'
  }

  process.stderr.write(
    `BLOCKED: Production file edit while reviewer findings are pending validation.\n\nUnvalidated findings:\n${findings}\n\nTo proceed: validate each finding (analyze the claim, check implications),\nthen delete .claude/review-gate.json to unlock edits.\n`,
  )
  process.exit(2)
})
