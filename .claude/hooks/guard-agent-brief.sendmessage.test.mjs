// Unit test for the PreToolUse Agent-brief guard's SendMessage coverage. Run:
//   node --test .claude/hooks/guard-agent-brief.sendmessage.test.mjs
// Split out of guard-agent-brief.test.mjs to keep that file under the test-file cap
// (code-style.md §1). Shared fixtures/helpers live in guard-agent-brief.testkit.mjs; this file
// owns its own SendMessage-specific fixture (SENDMSG_ROOT); it cleans up both.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { cleanupFixtures, EMPTY_ROOT, exactBrief, runHook } from './guard-agent-brief.testkit.mjs'

// SendMessage fixture — a session directory carrying subagent `meta.json` files, the shape
// `resolveSendMessageType` reads:
// <dirname(transcript_path)>/<session_id>/subagents/agent-<id>.meta.json. Separate from the
// testkit's fixture root (which the plan-path/branch fixtures use) so it can be removed independently.
const SENDMSG_ROOT = mkdtempSync(path.join(tmpdir(), 'guard-agent-brief-sendmsg-'))
const SESSION_ID = 'sess-e2e'
const TRANSCRIPT_PATH = path.join(SENDMSG_ROOT, 'transcript.jsonl')
// `^a[0-9a-f]{16}$` — 'a' plus 16 hex digits.
const GATED_AGENT_ID = `a${'1'.repeat(16)}`
const UNGATED_AGENT_ID = `a${'2'.repeat(16)}`
// UNKNOWN_AGENT_ID intentionally has no meta.json — simulates an unreadable resolution.
const UNKNOWN_AGENT_ID = `a${'3'.repeat(16)}`
const SUBAGENTS_DIR = path.join(SENDMSG_ROOT, SESSION_ID, 'subagents')
mkdirSync(SUBAGENTS_DIR, { recursive: true })
writeFileSync(
  path.join(SUBAGENTS_DIR, `agent-${GATED_AGENT_ID}.meta.json`),
  JSON.stringify({ agentType: 'code-reviewer', description: 'x', toolUseId: 't1', spawnDepth: 1 }),
)
writeFileSync(
  path.join(SUBAGENTS_DIR, `agent-${UNGATED_AGENT_ID}.meta.json`),
  JSON.stringify({ agentType: 'Explore', description: 'x', toolUseId: 't2', spawnDepth: 1 }),
)

after(() => {
  rmSync(SENDMSG_ROOT, { recursive: true, force: true })
  cleanupFixtures()
})

/** SendMessage's PreToolUse payload — `session_id`/`transcript_path` are TOP-LEVEL fields, unlike
 * Agent's `cwd`. `extra` can override or, passed as `undefined`, drop a top-level field — e.g.
 * `{ transcript_path: undefined }` simulates a payload that never carried one. */
function sendPayload(to, extra = {}, message = 'status update') {
  return JSON.stringify({
    session_id: SESSION_ID,
    transcript_path: TRANSCRIPT_PATH,
    hook_event_name: 'PreToolUse',
    tool_name: 'SendMessage',
    tool_input: { to, message },
    ...extra,
  })
}

// SendMessage to an agent id resolving to a gated type is blocked, the same gating rule as
// the Agent tool. `to` naming a plain name or `main` never needs resolving.
test('allows a SendMessage sent to a plain agent name with exit 0', () => {
  const r = runHook(sendPayload('general-purpose'))
  assert.equal(r.status, 0)
})

test('allows a SendMessage sent to "main" with exit 0', () => {
  const r = runHook(sendPayload('main'))
  assert.equal(r.status, 0)
})

// GROUP: guard-agent-brief-sendmessage-gated-check-disabled
test('allows a SendMessage whose to resolves to an ungated agent type', () => {
  const r = runHook(sendPayload(UNGATED_AGENT_ID))
  assert.equal(r.status, 0)
})

// GROUP: guard-agent-brief-sendmessage-id-check-disabled, guard-agent-brief-sendmessage-meta-unreadable-disabled, guard-agent-brief-sendmessage-gated-check-disabled
test('blocks a SendMessage whose to resolves to a gated agent type with exit 2', () => {
  const r = runHook(sendPayload(GATED_AGENT_ID))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /type is gated/)
})

// GROUP: guard-agent-brief-sendmessage-ref-strip-disabled, guard-agent-brief-sendmessage-meta-unreadable-disabled, guard-agent-brief-sendmessage-gated-check-disabled
test('blocks a SendMessage to a gated agent id written with a trailing ref suffix with exit 2', () => {
  const r = runHook(sendPayload(`${GATED_AGENT_ID} [3fa9c1]`))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /type is gated/)
})

// GROUP: guard-agent-brief-sendmessage-id-check-disabled, guard-agent-brief-sendmessage-meta-unreadable-disabled
test('blocks a SendMessage to an agent id whose meta.json does not exist with exit 2', () => {
  const r = runHook(sendPayload(UNKNOWN_AGENT_ID))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /cannot be resolved/)
})

// GROUP: guard-agent-brief-sendmessage-id-check-disabled, guard-agent-brief-sendmessage-context-missing-disabled
test('blocks a SendMessage to an agent id when transcript_path is missing with exit 2', () => {
  const r = runHook(sendPayload(GATED_AGENT_ID, { transcript_path: undefined }))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /cannot be resolved/)
})

// GROUP: guard-agent-brief-sendmessage-id-check-disabled, guard-agent-brief-sendmessage-context-missing-disabled
test('blocks a SendMessage to an agent id when session_id is missing with exit 2', () => {
  const r = runHook(sendPayload(GATED_AGENT_ID, { session_id: undefined }))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /cannot be resolved/)
})

// GROUP: guard-agent-brief-sendmessage-subagent-dir-disabled, guard-agent-brief-sendmessage-id-check-disabled, guard-agent-brief-sendmessage-meta-unreadable-disabled, guard-agent-brief-sendmessage-gated-check-disabled
test('blocks a SendMessage from a subagent to a gated agent id with exit 2', () => {
  const subagentTranscript = path.join(SUBAGENTS_DIR, `agent-${UNGATED_AGENT_ID}.jsonl`)
  const r = runHook(sendPayload(GATED_AGENT_ID, { transcript_path: subagentTranscript }))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /type is gated/)
})

// GROUP: guard-agent-brief-sendmessage-trim-disabled, guard-agent-brief-sendmessage-id-check-disabled, guard-agent-brief-sendmessage-meta-unreadable-disabled, guard-agent-brief-sendmessage-gated-check-disabled
test('blocks a SendMessage to a gated agent id padded with whitespace with exit 2', () => {
  const r = runHook(sendPayload(` ${GATED_AGENT_ID} `))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /type is gated/)
})

// GROUP: guard-agent-brief-sendmessage-case-disabled, guard-agent-brief-sendmessage-id-check-disabled, guard-agent-brief-sendmessage-meta-unreadable-disabled, guard-agent-brief-sendmessage-gated-check-disabled
test('blocks a SendMessage to a gated agent id written in upper case with exit 2', () => {
  const r = runHook(sendPayload(GATED_AGENT_ID.toUpperCase()))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /type is gated/)
})

// GROUP: guard-agent-brief-sendmessage-brief-check-disabled, guard-agent-brief-gated-scope-disabled
test('blocks a gate brief sent to an ungated agent id with exit 2', () => {
  const r = runHook(sendPayload(UNGATED_AGENT_ID, {}, exactBrief('code-reviewer')))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /contains a gate-reviewer brief/)
})

// GROUP: guard-agent-brief-sendmessage-brief-check-disabled, guard-agent-brief-brief-contains-narrowed
test('blocks a gate brief sent to a plain agent name with exit 2', () => {
  const r = runHook(sendPayload('general-purpose', {}, `FYI:\n${exactBrief('deletion-reviewer')}`))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /contains a gate-reviewer brief/)
})

// GROUP: guard-agent-brief-templates-unreadable-allows, guard-agent-brief-sendmessage-brief-check-disabled
test('blocks a SendMessage to a plain agent name with exit 2 when the templates file has no templates object', () => {
  const r = runHook(sendPayload('main'), EMPTY_ROOT)
  assert.equal(r.status, 2)
  assert.match(r.stderr, /supplies no gate template openings/)
})
