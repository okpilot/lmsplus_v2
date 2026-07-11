// Unit test for the PreToolUse Bash guard. Run:
//   node .claude/hooks/guard-bash.test.mjs
// Spawns the real hook as a child process and feeds the Claude Code hook payload
// ({"tool_input":{"command":"..."}}) on STDIN — the channel the harness actually
// uses — so these tests pin the input contract, not just the pattern matching.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'guard-bash.js')

function runHook(stdin) {
  return spawnSync('node', [HOOK], { input: stdin, encoding: 'utf8' })
}

test('blocks a dangerous command delivered via stdin JSON with exit 2 and a BLOCKED stderr', () => {
  const r = runHook('{"tool_input":{"command":"DROP DATABASE x"}}')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /BLOCKED/)
})

test('allows a benign command with exit 0', () => {
  const r = runHook('{"tool_input":{"command":"ls -la"}}')
  assert.equal(r.status, 0)
})

test('fails open but loud on unparseable stdin (exit 0 + unparseable warning)', () => {
  const r = runHook('not-json')
  assert.equal(r.status, 0)
  assert.match(r.stderr, /unparseable/)
})

test('fails open but loud on empty stdin (exit 0 + stderr warning)', () => {
  const r = runHook('')
  assert.equal(r.status, 0)
  assert.match(r.stderr, /unparseable hook payload/)
})

test('fails open but loud on a payload over 1MB (exit 0 + size warning)', () => {
  const r = runHook('x'.repeat(1_100_000))
  assert.equal(r.status, 0)
  assert.match(r.stderr, /exceeds 1MB/)
})

test('blocks a dangerous command in flat JSON shape (backward-compat path)', () => {
  // guard-bash.js falls back to toolInput?.command when tool_input is absent.
  // This compatibility path must block just like the nested shape does.
  const r = runHook('{"command":"DROP DATABASE x"}')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /BLOCKED/)
})

test('blocks a non-string command payload (array) with exit 2 and a "non-string command" stderr diagnostic', () => {
  // RegExp.test coerces non-strings, so ["rm","-rf","/"] stringifies to "rm,-rf,/"
  // and could dodge the denylist patterns — the hook must refuse to pattern-match it.
  const r = runHook('{"tool_input":{"command":["rm","-rf","/"]}}')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /non-string command/)
})

test('fails open even when an oversized payload contains valid JSON with a blocked command (exit 0 + size warning)', () => {
  // The oversizedPayload flag set in the 'data' handler short-circuits the 'end' handler
  // via `if (oversizedPayload) return` before it can parse the JSON and match blocked
  // patterns. Without the flag, JSON.parse would succeed here, the DROP DATABASE pattern
  // would match, and the hook would exit 2 — incorrectly blocking the tool call.
  // The existing >1MB test uses non-JSON (plain 'x' bytes), which would also exit 0 via
  // the malformed-JSON fail-open path even without the flag — so it cannot catch that
  // regression. This test closes the gap with a valid JSON payload.
  const pad = 'x'.repeat(2_000_000)
  const bigBlockedPayload = `{"tool_input":{"command":"DROP DATABASE x","pad":"${pad}"}}`
  const r = runHook(bigBlockedPayload)
  assert.equal(r.status, 0)
  assert.match(r.stderr, /exceeds 1MB/)
})
