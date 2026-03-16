#!/usr/bin/env node
/**
 * PreToolUse guard for Bash commands.
 * Blocks dangerous operations before they run.
 * Claude Code calls this with the full tool input as a JSON string argument.
 */

const input = process.argv[2] ?? ''
let toolInput

try {
  toolInput = JSON.parse(input)
} catch {
  // If we can't parse, let it through — we only block known dangerous patterns
  process.exit(0)
}

// Claude Code wraps tool params under tool_input; fall back to flat shape for compatibility
const command = toolInput?.tool_input?.command ?? toolInput?.command ?? ''

const BLOCKED_PATTERNS = [
  // Destructive filesystem
  { pattern: /rm\s+-rf?\s+\//, reason: 'Refusing rm -rf on root path' },
  { pattern: /rm\s+-rf\s+\*/, reason: 'Refusing rm -rf *' },
  // Secrets exposure
  { pattern: /cat\s+\.env(?!\.example)/, reason: 'Refusing to cat .env files (use Read tool)' },
  // Force push to protected branches
  { pattern: /git\s+push.*--force.*(?:main|master)/, reason: 'Refusing force push to main/master' },
  { pattern: /git\s+push\s+-f.*(?:main|master)/, reason: 'Refusing force push to main/master' },
  // Hard reset
  {
    pattern: /git\s+reset\s+--hard\s+HEAD~/,
    reason: 'Refusing git reset --hard HEAD~ (destructive)',
  },
  // Drop database
  { pattern: /DROP\s+DATABASE/i, reason: 'Refusing DROP DATABASE' },
  { pattern: /DROP\s+SCHEMA\s+public/i, reason: 'Refusing DROP SCHEMA public' },
]

for (const { pattern, reason } of BLOCKED_PATTERNS) {
  if (pattern.test(command)) {
    // Output to stderr — Claude Code reads this as the block reason
    process.stderr.write(`BLOCKED: ${reason}\nCommand was: ${command}\n`)
    process.exit(2) // Exit code 2 = block the tool call
  }
}

process.exit(0) // Allow
