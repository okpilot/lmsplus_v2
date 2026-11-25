// Unit test for the PreToolUse Bash guard. Run:
//   node .claude/hooks/guard-bash.test.mjs
// Spawns the real hook as a child process and feeds the Claude Code hook payload
// ({"tool_input":{"command":"..."}}) on STDIN — the channel the harness actually
// uses — so these tests pin the input contract, not just the pattern matching.
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runNode } from './spawn.testkit.mjs'

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'guard-bash.js')

const TIMEOUT_MS = 5_000

// runNode throws NO VERDICT on a signal, a timeout or a failed spawn — `status: null` otherwise
// reaches `assert.equal(r.status, 2)` and reports a kill as a wrong exit code. It also grades a run
// whose `input:` pipe broke, which the >1MB case below provokes: the hook stops reading, the
// parent's write gets EPIPE, and the run still exited 0 with its warning on stderr.
function runHook(stdin) {
  return runNode('guard-bash.js', [HOOK], { input: stdin, timeout: TIMEOUT_MS })
}

// CONTROL: red
// GROUP: guard-bash-always-passes
test('blocks a dangerous command delivered via stdin JSON with exit 2 and a BLOCKED stderr', () => {
  const r = runHook('{"tool_input":{"command":"DROP DATABASE x"}}')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /BLOCKED/)
})

// CONTROL: green
// GROUP: guard-bash-always-blocks
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

test('fails closed on a payload over 1MB (exit 2 + size message)', () => {
  const r = runHook('x'.repeat(1_100_000))
  assert.equal(r.status, 2)
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

test('fails closed on an oversized payload whose valid JSON carries a blocked command (exit 2 + size message)', () => {
  // The oversizedPayload flag set in the 'data' handler short-circuits the 'end' handler via
  // `if (oversizedPayload) return`, so the payload is refused rather than pattern-matched while
  // truncated. Exit 2 is the INTENDED outcome: a denylist cannot be trusted on a payload it has
  // only partly seen, and padding in front of a destructive command is how one gets bypassed.
  // Without the flag this valid-JSON payload would parse, the blocked pattern below would match,
  // and the hook would exit 2 for the WRONG reason — leaving the size branch itself untested.
  // The `/exceeds 1MB/` stderr match is what separates the two. The other >1MB test uses
  // non-JSON ('x' bytes), which without the flag exits 0 down the malformed-JSON path
  // (`[guard-bash] unparseable hook payload — allowing command`, guard-bash.js:43-50), so it
  // cannot pin this branch either.
  const pad = 'x'.repeat(2_000_000)
  const bigBlockedPayload = `{"tool_input":{"command":"DROP DATABASE x","pad":"${pad}"}}`
  const r = runHook(bigBlockedPayload)
  assert.equal(r.status, 2)
  assert.match(r.stderr, /exceeds 1MB/)
})

test('fails closed on a 1.1MB payload ending in a destructive command after a no-op prefix', () => {
  const r = runHook(`{"tool_input":{"command":": ${'x'.repeat(1_100_000)}; ${'rm -rf'} /"}}`)
  assert.equal(r.status, 2)
  assert.match(r.stderr, /exceeds 1MB/)
})
