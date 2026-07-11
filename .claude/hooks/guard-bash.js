#!/usr/bin/env node
/**
 * PreToolUse guard for Bash commands.
 * Blocks dangerous operations before they run.
 *
 * Claude Code delivers the hook payload on STDIN as JSON:
 *   {"tool_input":{"command":"..."}}
 * (There is no $CLAUDE_TOOL_INPUT argv — the previous argv-based version
 * never received a payload and silently allowed everything.)
 * Reference pattern: .claude/hooks/review-gate.js (stdin accumulate + parse on 'end').
 */

let input = ''
process.stdin.setEncoding('utf8')
// A stream error would otherwise exit 1 (undocumented for PreToolUse hooks) with no
// stderr signal — make the fail-open explicit and observable instead.
process.stdin.on('error', (err) => {
  console.error('[guard-bash] stdin error — allowing command:', err.message)
  process.exit(0)
})
process.stdin.on('data', (chunk) => {
  input += chunk
})
process.stdin.on('end', () => {
  let toolInput
  try {
    toolInput = JSON.parse(input)
  } catch {
    // Fail-open-but-loud ONLY for malformed payloads — we can't match what we can't parse.
    console.error('[guard-bash] unparseable hook payload — allowing command')
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
    {
      pattern: /git\s+push.*--force.*(?:main|master)/,
      reason: 'Refusing force push to main/master',
    },
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
})
