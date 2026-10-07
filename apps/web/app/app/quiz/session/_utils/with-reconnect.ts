import { withTimeout } from '@/lib/utils/with-timeout'
import { isSignInError, SIGN_IN } from '../../actions/progress-error-messages'
import { classifyFailure, linkIsDown } from './classify-failure'
import {
  _resetConnectionState,
  adjustPending,
  getConnectionSnapshot,
  getConnectionStatus,
  markSaved,
  setConnectionStatus,
} from './connection-state'
import type { Hold } from './hold-types'
import { clearRetryWaiters, waitForRetry, wakeRetryWaiters } from './retry-wait'

type ActionResult = { success: boolean; error?: string }
type SignedOutResult = { success: false; error: string }
type Attempt<T> =
  | { kind: 'done'; value: T }
  | { kind: 'rethrow'; err: unknown }
  | { kind: 'signed-out' }

export const ATTEMPT_TIMEOUT_MS = 15_000

const TRUSTED_NETWORK_FAILS = 3
const TIMED_OUT = Symbol('timed-out')
const THROWN = { kind: 'thrown' as const }

const SIGNED_OUT: SignedOutResult = { success: false, error: SIGN_IN }

// One FIFO for the whole tab: every call takes its slot when issued, so issue order = landing order.
let tail: Promise<unknown> = Promise.resolve()
let linkUp = true
// A batch starts when the status goes offline or slow and ends when the last waiting job settles.
let batchOk = true

/** @internal Test-only reset for the module-level queue. */
export function _resetWithReconnect() {
  tail = Promise.resolve()
  linkUp = true
  batchOk = true
  clearRetryWaiters()
  _resetConnectionState()
}

function isHandled(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const r = value as { success?: unknown; error?: unknown }
  if (typeof r.success !== 'boolean') return false
  return !(r.success === false && typeof r.error === 'string' && isSignInError(r.error))
}

async function awaitRequest<T>(request: Promise<T>): Promise<T> {
  let settled = false
  const markSettled = () => {
    settled = true
  }
  request.then(markSettled, markSettled)
  const raced = await withTimeout<T | typeof TIMED_OUT>(request, ATTEMPT_TIMEOUT_MS, TIMED_OUT)
  if (raced !== TIMED_OUT) return raced
  const down = await linkIsDown()
  if (!settled) {
    if (down) markOffline()
    else markSlow()
  }
  return await request
}

async function attempt<T>(
  fn: () => Promise<T>,
  trustTypeError: boolean,
): Promise<Attempt<T> | { kind: 'offline' }> {
  let value: T | undefined
  let thrown: unknown
  let didThrow = false
  try {
    value = await awaitRequest(fn())
    if (isHandled(value)) return { kind: 'done', value }
  } catch (err) {
    didThrow = true
    thrown = err
  }
  const responded = !(didThrow && thrown instanceof TypeError)
  const kind = await classifyFailure(didThrow && trustTypeError ? thrown : undefined, responded)
  if (kind !== 'server') return { kind }
  return didThrow ? { kind: 'rethrow', err: thrown } : { kind: 'done', value: value as T }
}

function markOffline() {
  const status = getConnectionStatus()
  if (status !== 'offline' && status !== 'slow') batchOk = true
  linkUp = false
  setConnectionStatus('offline')
}

function markSlow() {
  const status = getConnectionStatus()
  if (status === 'offline' || status === 'signed-out' || status === 'slow') return
  if (status === 'save-failed') return // a held save owns the block
  batchOk = true
  setConnectionStatus('slow')
}

async function retryUntilSettled<T>(fn: () => Promise<T>): Promise<Attempt<T>> {
  let waits = 0
  for (;;) {
    if (getConnectionStatus() === 'signed-out') return { kind: 'signed-out' }
    if (!linkUp) await waitForRetry(waits++)
    const result = await attempt(fn, waits < TRUSTED_NETWORK_FAILS)
    if (result.kind !== 'offline') {
      linkUp = true
      return result
    }
    markOffline()
  }
}

function settle<T>(result: Attempt<T>): T | SignedOutResult {
  if (result.kind === 'rethrow') throw result.err
  if (result.kind === 'signed-out') return SIGNED_OUT
  return result.value
}

function landed<T>(result: Attempt<T>): boolean {
  if (result.kind !== 'done') return false
  return (result.value as { success?: unknown } | null)?.success === true
}

function endBatchIfIdle() {
  const status = getConnectionStatus()
  if (getConnectionSnapshot().pending > 0 || (status !== 'offline' && status !== 'slow')) return
  if (batchOk) markSaved()
  else setConnectionStatus('ok')
  batchOk = true
}

async function settleWithHold<T>(fn: () => Promise<T>, hold?: Hold<T>): Promise<Attempt<T>> {
  let result = await retryUntilSettled(fn)
  while (hold && result.kind !== 'signed-out') {
    const outcome =
      result.kind === 'done' ? { kind: 'value' as const, value: result.value } : THROWN
    if ((await hold(outcome)) !== 'retry') break
    result = await retryUntilSettled(fn)
  }
  return result
}

async function runJob<T>(fn: () => Promise<T>, hold?: Hold<T>): Promise<T | SignedOutResult> {
  const result = await settleWithHold(fn, hold)
  adjustPending(-1)
  if (result.kind === 'signed-out') setConnectionStatus('signed-out')
  else {
    if (!landed(result)) batchOk = false
    endBatchIfIdle()
  }
  return settle(result)
}

/** Called on session-page mount: wakes jobs sleeping in backoff, and clears a stale offline, slow
 * or signed-out status when no job is pending. */
export function resumeQueue() {
  linkUp = true
  wakeRetryWaiters()
  const { status, pending } = getConnectionSnapshot()
  if (pending === 0 && (status === 'offline' || status === 'slow' || status === 'signed-out')) {
    setConnectionStatus('ok')
  }
}

/** Resolves once every queued job has settled and their microtask follow-up has run; a stalled save keeps the caller waiting. */
export function whenQueueIdle(): Promise<void> {
  return tail.then(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
}

/**
 * Runs a Server Action call, FIFO with every other call in this tab. A network failure blocks
 * (status 'offline') and the call is resent on reconnect until it lands; an expired sign-in
 * resolves to a SIGN_IN failure; any other outcome passes through unchanged (a thrown server
 * error is rethrown). A request still open after ATTEMPT_TIMEOUT_MS shows a block while the SAME
 * request keeps being awaited until it settles; it is resent only after it fails. The block is
 * 'offline' when the link is definitely down, else 'slow' ("still saving"): Next.js runs Server
 * Actions one at a time, so the wait may be time queued behind another action. A resend could
 * not go out before it anyway. A thrown TypeError is offline without a probe for a call's first TRUSTED_NETWORK_FAILS attempts,
 * then the probe decides: a flapping link failing that often and probing up rethrows.
 * An optional `hold` sees each settled result and may ask for a resend in the same queue slot,
 * so Finish and later saves wait behind it.
 * Residual: a stalled socket the browser never fails keeps the quiz blocked until the browser
 * gives up on it.
 */
export async function withReconnect<T extends ActionResult>(
  fn: () => Promise<T>,
  hold?: Hold<T>,
): Promise<T | SignedOutResult> {
  if (getConnectionStatus() === 'signed-out') return SIGNED_OUT
  const idle = getConnectionSnapshot().pending === 0
  adjustPending(1)
  const job = idle ? runJob(fn, hold) : tail.then(() => runJob(fn, hold))
  tail = job.catch(() => {})
  return job
}
