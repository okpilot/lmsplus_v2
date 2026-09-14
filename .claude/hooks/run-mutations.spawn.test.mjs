// Run: node --test .claude/hooks/run-mutations.spawn.test.mjs
//
// `assertSpawnUsable` — how a finished `spawnSync` result is read, before anything is graded.
//
// A SIBLING file, not a section of `run-mutations.test.mjs`: that suite is near its cap in
// `.claude/limits.json`, and the split is the house pattern (`check-retracted-phrase` ships
// `.test.mjs` + `.repo.test.mjs`). Both suites are listed in `run-mutations.mutations.json`, so a
// break in either is graded by the harness itself.
//
// This logic was inside `runMutation` until the extraction, where the suite header's own scope
// note put it beyond reach of every test — the shape `code-style.md` § "A Test Must Fail If Its
// Mechanism Is Removed" is about. The measured basis for the branch order, re-derivable by
// running the matrix in the commit that added it: a timeout sets `error` (code ETIMEDOUT) AND
// `signal`; a spawn failure sets `error` alone; an external kill sets `signal` alone.
//
// Every case is MUTATION-PINNED: the opening comment names the break that turns THAT test red.

import assert from 'node:assert/strict'
import test from 'node:test'
import { assertSpawnUsable } from './run-mutations.mjs'

const timedOut = () => ({
  error: Object.assign(new Error('spawnSync node ETIMEDOUT'), { code: 'ETIMEDOUT' }),
  signal: 'SIGKILL',
})

// MUTATION: delete the `if (r.error.code === 'ETIMEDOUT')` block in assertSpawnUsable.
// The generic branch then reports a spawn failure for a spawn that succeeded.
test('names the timeout, not the spawn, when a suite runs long', () => {
  assert.throws(() => assertSpawnUsable('m1', timedOut(), 120000), /suite run exceeded 120000ms/)
})

// MUTATION: in the ETIMEDOUT throw, drop `${timeoutMs}ms` from the message.
// A reader then cannot tell which budget was exceeded.
test('reports the budget that was exceeded, not merely that one was', () => {
  assert.throws(() => assertSpawnUsable('m1', timedOut(), 4500), /4500ms/)
})

// MUTATION: in the ETIMEDOUT throw, replace 'NO VERDICT' with 'SURVIVED'.
// A harness failure would then read as a finding about the tests.
test('declares no verdict on a timeout rather than a result', () => {
  assert.throws(() => assertSpawnUsable('m1', timedOut(), 120000), /NO VERDICT/)
})

// MUTATION: change `if (r.error)` to `if (false)` in assertSpawnUsable.
// A timeout sets BOTH fields, so it then falls through to the signal branch, which says in so
// many words that no timeout was reported — the precise inversion the branch order prevents.
test('prefers the timeout over the signal when a timeout set both', () => {
  assert.throws(
    () => assertSpawnUsable('m1', timedOut(), 120000),
    (err) => {
      assert.doesNotMatch(err.message, /no timeout reported/)
      return true
    },
  )
})

// MUTATION: delete the generic `throw` that follows the ETIMEDOUT block.
// A real spawn failure then returns as if the run were gradeable.
test('refuses a run whose binary never started', () => {
  const r = { error: Object.assign(new Error('spawnSync node ENOENT'), { code: 'ENOENT' }) }
  assert.throws(() => assertSpawnUsable('spawn-enoent-id', r, 120000), /could not spawn node/)
  assert.throws(() => assertSpawnUsable('spawn-enoent-id', r, 120000), /spawn-enoent-id/)
})

// MUTATION: delete the whole `if (r.signal)` block.
// An externally killed run then reaches the TAP parse with truncated output.
test('refuses a run killed by something other than the timeout', () => {
  assert.throws(
    () => assertSpawnUsable('kill-signal-id', { signal: 'SIGKILL' }, 120000),
    /killed by SIGKILL \(no timeout reported\)/,
  )
  assert.throws(
    () => assertSpawnUsable('kill-signal-id', { signal: 'SIGKILL' }, 120000),
    /kill-signal-id/,
  )
})

// MUTATION: change `if (r.error)` to `if (r.error !== undefined)` in assertSpawnUsable.
// An explicit `error: null` then enters the block and dereferences it, so a run that merely
// finished raises a TypeError instead of being graded. Truthiness is what makes both absent
// shapes — `undefined` and `null` — mean the same thing here.
test('grades a run that finished on its own, whether it passed or failed', () => {
  assert.doesNotThrow(() => assertSpawnUsable('m1', { status: 0, signal: null }, 120000))
  assert.doesNotThrow(() => assertSpawnUsable('m1', { status: 1, signal: null }, 120000))
  assert.doesNotThrow(() =>
    assertSpawnUsable('m1', { error: null, status: 0, signal: null }, 120000),
  )
})

// MUTATION: interpolate a literal in place of `${mutId}` in the timeout throw.
// A failing run in a batch this size — `node .claude/hooks/run-mutations.mjs` reports the total
// it actually ran — then cannot be traced to the mutation that caused it.
// (The fixture is timedOut() — only the ETIMEDOUT path is reached; the other two throws are
// pinned implicitly by tests 5 and 6 above, which use distinctive mutIds and assert they appear.)
test('names which mutation failed, so one bad run in a batch is findable', () => {
  assert.throws(
    () => assertSpawnUsable('drop-skip-directive-filter', timedOut(), 1),
    /drop-skip-directive-filter/,
  )
})

// MUTATION: delete the `if (r == null)` guard at the top of assertSpawnUsable.
// A null result then dereferences to a TypeError naming a property, which says nothing about
// which mutation produced it — the one thing every other message here is careful to say.
test('refuses a result that is not there at all, rather than dereferencing it', () => {
  assert.throws(() => assertSpawnUsable('absent-id', null, 120000), /absent-id: no spawn result/)
  assert.throws(
    () => assertSpawnUsable('absent-id', undefined, 120000),
    /absent-id: no spawn result/,
  )
})
