// Run: node --test .claude/hooks/spawn.testkit.test.mjs
//
// The shared spawn verdict helpers. Half the cases are synthetic result objects, because a
// spawnSync shape is cheaper to construct than to provoke; the other half spawn a REAL child and
// kill it, because a synthetic fixture proves only that the code matches my belief about what node
// returns — and that belief is exactly what #1303 falsified.

import assert from 'node:assert/strict'
import test from 'node:test'
import { assertUsable, runNode, verdictOf } from './spawn.testkit.mjs'

test('a run that exited with a code is graded, not rejected', () => {
  assert.equal(assertUsable('x', { status: 0, signal: null }), undefined)
  assert.equal(assertUsable('x', { status: 2, signal: null }), undefined)
})

// MUTATION: delete the `r == null` branch -> a missing result reaches `r.error` and throws a bare
// TypeError, which names neither the label nor the fact that nothing was graded.
// GROUP: drop-null-result-branch
test('a missing result is reported as no verdict, naming what ran', () => {
  assert.throws(() => assertUsable('the guard', null), /the guard: no spawn result to read/)
  assert.throws(() => assertUsable('the guard', undefined), /NO VERDICT/)
})

// MUTATION: move the ETIMEDOUT check below the generic `error` throw -> a timeout reports "could
// not spawn", naming a cause that did not happen, and the timeout message is unreachable.
// GROUP: etimedout-after-generic-error
test('a timed-out run names the budget it exceeded, not a spawn failure', () => {
  const r = { error: Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' }) }
  assert.match(
    assertThrown(() => assertUsable('the guard', r, 5000)),
    /exceeded 5000ms/,
  )
  assert.doesNotMatch(
    assertThrown(() => assertUsable('the guard', r, 5000)),
    /could not spawn/,
  )
})

test('a timed-out run with no stated budget still reports a timeout', () => {
  const r = { error: Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' }) }
  assert.match(
    assertThrown(() => assertUsable('the guard', r)),
    /exceeded its timeout/,
  )
})

test('a child that never started names the underlying cause', () => {
  const r = { error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }) }
  assert.match(
    assertThrown(() => assertUsable('the guard', r)),
    /could not spawn — spawn ENOENT/,
  )
})

// MUTATION: delete the `r.signal` branch -> a killed child returns status null to the caller, whose
// `assert.equal(status, 1)` then reddens with `null !== 1` and names no signal. This is #1303.
// GROUP: drop-signal-branch
test('a killed run is reported as no verdict, naming the signal', () => {
  const r = { status: null, signal: 'SIGKILL' }
  assert.match(
    assertThrown(() => assertUsable('the guard', r)),
    /killed by SIGKILL — NO VERDICT/,
  )
})

// MUTATION: delete the `r.status == null` backstop -> a result carrying neither a status, a signal
// nor an error passes as gradable, and the caller compares an exit code against null.
// GROUP: drop-null-status-backstop
test('a run with neither a status nor a signal is not treated as gradable', () => {
  assert.match(
    assertThrown(() => assertUsable('the guard', { status: null, signal: null })),
    /no status and no signal — NO VERDICT/,
  )
})

test('a real child that exits non-zero yields its code and its output', () => {
  const r = runNode('the guard', ['-e', 'process.stderr.write("boom"); process.exit(3)'])
  assert.equal(r.status, 3)
  assert.equal(r.stderr, 'boom')
  assert.equal(r.stdout, '')
})

test('a real child killed by a signal is reported as no verdict', () => {
  // The #1303 reproduction: before this helper existed, the caller saw `status: null` and asserted
  // on it. Self-kill rather than an external one so the test needs no second process to time.
  const thrown = assertThrown(() =>
    runNode('the guard', ['-e', 'process.kill(process.pid, "SIGKILL")']),
  )
  assert.match(thrown, /the guard: killed by SIGKILL — NO VERDICT/)
})

test('a real child that outruns its timeout is reported as no verdict', () => {
  const thrown = assertThrown(() => runNode('the guard', ['-e', 'while (true);'], { timeout: 300 }))
  assert.match(thrown, /exceeded 300ms and was killed — NO VERDICT/)
})

// MUTATION: delete the `err.signal` branch -> a killed child becomes `{status: null}`, and the
// caller's `assert.notEqual(err.status, 0)` PASSES on it. A false green, not a false red.
// GROUP: verdictof-drop-signal-branch
test('a thrown child killed by a signal is not converted into a verdict', () => {
  const err = Object.assign(new Error('killed'), { status: null, signal: 'SIGTERM' })
  assert.match(
    assertThrown(() => verdictOf('the guard', err)),
    /killed by SIGTERM — NO VERDICT/,
  )
})

// MUTATION: delete the `err.status == null` branch -> a spawn that never became a process returns
// `{status: null}` and reads as an ordinary non-zero exit.
// GROUP: verdictof-drop-null-status-branch
test('a thrown child that never reached an exit code is not converted into a verdict', () => {
  const err = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })
  assert.match(
    assertThrown(() => verdictOf('the guard', err)),
    /did not run to an exit code/,
  )
})

test('a thrown child that exited non-zero yields its code and its output', () => {
  const err = Object.assign(new Error('exit 1'), { status: 1, stdout: 'out', stderr: 'err' })
  assert.deepEqual(verdictOf('the guard', err), { status: 1, stdout: 'out', stderr: 'err' })
})

test('a thrown child with no captured output yields empty strings, never undefined', () => {
  // Callers match on stderr; `assert.match(undefined, /x/)` throws a TypeError naming neither the
  // guard nor the expectation.
  assert.deepEqual(verdictOf('the guard', { status: 1 }), { status: 1, stdout: '', stderr: '' })
})

test('a missing error object is reported as no verdict', () => {
  assert.match(
    assertThrown(() => verdictOf('the guard', null)),
    /no error to read — NO VERDICT/,
  )
})

/** Run `fn`, return the message it threw. Fails the test if it did not throw. */
function assertThrown(fn) {
  try {
    fn()
  } catch (err) {
    return err.message
  }
  assert.fail('expected a throw, got a clean return')
}
