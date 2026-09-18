// Spawn verdicts for the guard suites. A child killed by a SIGNAL produced NO VERDICT — it is not
// a failed assertion, and reporting it as one is what #1303 cost.
//
// `spawnSync` sets `status: null` and `signal` on a kill, so `assert.equal(r.status, 1)` reddens a
// test the code under it never reached; `execFileSync` throws with `err.status === null`, so
// `assert.notEqual(err.status, 0)` PASSES on a kill — the same hole, inverted, and the worse of the
// two. Every helper here converts both into a throw that names the signal.
//
// Mirrors `assertSpawnUsable` in run-mutations.mjs, which this cannot import: that one's messages
// name a mutation id, and the harness has no business being a dependency of the guard suites.
//
// EXIT CODES ARE NOT INTERPRETED HERE, deliberately. Exit 2 means "could not run — BLOCKING" in the
// prose-claims, prose-paths and retracted-phrase guards; it means BLOCK, the success case, in
// guard-bash.js and review-gate.js; check-file-size-guard.mjs has no exit 2 at all and folds
// "cannot read config" into 1 on purpose. One helper cannot rank those. It answers
// verdict-vs-no-verdict; what a verdict MEANS stays at the call site.
//
// Not a guard and not a suite: it defines no tests, so it needs no ci.yml step of its own — its
// importers each have one, and spawn.testkit.test.mjs covers it directly.

import { spawnSync } from 'node:child_process'

/**
 * Throw unless `r` is a spawnSync result whose exit code can be graded.
 *
 * @param {string} label  what ran, for the message — the caller has the context, this file has none
 * @param {object} r      a spawnSync return value
 * @param {number} [timeoutMs]  the timeout passed to spawnSync, named in the ETIMEDOUT message
 */
export function assertUsable(label, r, timeoutMs) {
  if (r == null) throw new Error(`${label}: no spawn result to read — NO VERDICT`)
  // ETIMEDOUT FIRST: spawnSync sets BOTH `error` and `signal` on a timeout, so a generic `error`
  // branch reports "could not spawn" for a child that spawned perfectly well and then ran long.
  if (r.error?.code === 'ETIMEDOUT') {
    const budget = timeoutMs == null ? 'its timeout' : `${timeoutMs}ms`
    throw new Error(`${label}: exceeded ${budget} and was killed — NO VERDICT`)
  }
  // A kill nobody here asked for: an OOM killer, an operator, a process-group teardown. The timeout
  // path throws above, so a signal reaching this line had none.
  if (r.signal) throw new Error(`${label}: killed by ${r.signal} — NO VERDICT`)
  // AN EXIT CODE OUTRANKS A LEFTOVER `error`, and this order is load-bearing. When the child stops
  // reading stdin early — which is what a guard short-circuiting on an oversized payload does — the
  // parent's `input:` write breaks and spawnSync sets EPIPE on a run that exited cleanly with its
  // diagnostic on stderr. Throwing there turns a real verdict into NO VERDICT: the very defect this
  // file exists to end, one level up.
  if (r.status != null) return
  if (r.error) throw new Error(`${label}: could not spawn — ${r.error.message}`)
  throw new Error(`${label}: exited with no status and no signal — NO VERDICT`)
}

/**
 * Run `node <args>` and return a gradable verdict, or throw.
 *
 * `process.execPath`, not the string 'node': the suites already run under the node that must run
 * the guard, and a PATH without one is a machine fault reported as a guard defect.
 *
 * @returns {{status: number, stdout: string, stderr: string}}
 */
export function runNode(label, args, opts = {}) {
  // A default, because none of the guard-suite CI steps carries `timeout-minutes`: without one a
  // child that never exits hangs the job rather than reporting NO VERDICT, and assertUsable's
  // ETIMEDOUT branch is unreachable unless a caller opts in. 60s is ~20x the slowest measured
  // SUITE total (check-prose-paths.repo, 2.95s, which is many spawns) — generous on purpose, since
  // a default that fires on a loaded runner would manufacture the false red this file exists to end.
  const timeout = opts.timeout ?? 60_000
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', ...opts, timeout })
  assertUsable(label, r, timeout)
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

/**
 * The execFileSync CATCH shape: turn a thrown child into the same verdict, or rethrow as NO VERDICT.
 *
 * `execFileSync` throws on ANY non-zero exit and on a kill alike, and the two are told apart only by
 * `err.signal` / `err.status`. A caller reading `err.status` without this cannot tell them apart.
 *
 * @returns {{status: number, stdout: string, stderr: string}}
 */
export function verdictOf(label, err) {
  if (err == null) throw new Error(`${label}: no error to read — NO VERDICT`)
  if (err.signal) throw new Error(`${label}: killed by ${err.signal} — NO VERDICT`)
  if (err.status == null) {
    // ENOENT, EACCES, a spawn that never became a process. `err.message` carries the cause.
    throw new Error(`${label}: did not run to an exit code — ${err.message} — NO VERDICT`)
  }
  return { status: err.status, stdout: String(err.stdout ?? ''), stderr: String(err.stderr ?? '') }
}
