import { withTimeout } from '@/lib/utils/with-timeout'
import { isSignInError, SIGN_IN } from '../../actions/progress-error-messages'
import { classifyFailure } from './classify-failure'
import {
  adjustPending,
  getConnectionStatus,
  markSaved,
  setConnectionStatus,
} from './connection-state'

type ActionResult = { success: boolean; error?: string }
type SignedOutResult = { success: false; error: string }
type Attempt<T> =
  | { kind: 'done'; value: T }
  | { kind: 'rethrow'; err: unknown }
  | { kind: 'signed-out' }

export const BACKOFF_MS = [2000, 4000, 8000, 10000]
export const ATTEMPT_TIMEOUT_MS = 15_000
export const ABANDON_AFTER_MS = 60_000

const TIMED_OUT = Symbol('timed-out')
const ABANDONED = Symbol('abandoned')

const SIGNED_OUT: SignedOutResult = { success: false, error: SIGN_IN }

// One FIFO for the whole tab: every call takes its slot when issued, so issue order = landing order.
let tail: Promise<unknown> = Promise.resolve()
let waiting = 0
let linkUp = true
// A batch starts when the status goes offline and ends when the last waiting job settles.
let batchOk = true

/** @internal Test-only reset for the module-level queue. */
export function _resetWithReconnect() {
  tail = Promise.resolve()
  waiting = 0
  linkUp = true
  batchOk = true
}

function isHandled(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const r = value as { success?: unknown; error?: unknown }
  if (typeof r.success !== 'boolean') return false
  return !(r.success === false && typeof r.error === 'string' && isSignInError(r.error))
}

type Abandon = {
  promise: Promise<typeof ABANDONED>
  listen: () => void
  dispose: () => void
}

// Fires at ABANDON_AFTER_MS from creation, or on `online` once listen() was called.
function createAbandon(): Abandon {
  let fire: () => void = () => {}
  const promise = new Promise<typeof ABANDONED>((resolve) => {
    fire = () => resolve(ABANDONED)
  })
  const timer = setTimeout(fire, ABANDON_AFTER_MS)
  return {
    promise,
    listen: () => window.addEventListener('online', fire),
    dispose: () => {
      clearTimeout(timer)
      window.removeEventListener('online', fire)
    },
  }
}

async function awaitRequest<T>(
  request: Promise<T>,
  abandon: Abandon,
): Promise<T | typeof ABANDONED> {
  const raced = await withTimeout<T | typeof TIMED_OUT>(request, ATTEMPT_TIMEOUT_MS, TIMED_OUT)
  if (raced !== TIMED_OUT) return raced
  markOffline()
  abandon.listen()
  return Promise.race([request, abandon.promise])
}

async function attempt<T>(fn: () => Promise<T>): Promise<Attempt<T> | { kind: 'offline' }> {
  let value: T | undefined
  let thrown: unknown
  let didThrow = false
  const abandon = createAbandon()
  try {
    const outcome = await awaitRequest(fn(), abandon)
    if (outcome === ABANDONED) return { kind: 'offline' }
    value = outcome
    if (isHandled(value)) return { kind: 'done', value }
  } catch (err) {
    didThrow = true
    thrown = err
  } finally {
    abandon.dispose()
  }
  const kind = await classifyFailure()
  if (kind !== 'server') return { kind }
  return didThrow ? { kind: 'rethrow', err: thrown } : { kind: 'done', value: value as T }
}

function waitForRetry(index: number): Promise<void> {
  const delay = BACKOFF_MS[Math.min(index, BACKOFF_MS.length - 1)]
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      window.removeEventListener('online', finish)
      resolve()
    }
    const timer = setTimeout(finish, delay)
    window.addEventListener('online', finish)
  })
}

function markOffline() {
  if (getConnectionStatus() !== 'offline') batchOk = true
  linkUp = false
  setConnectionStatus('offline')
}

async function retryUntilSettled<T>(fn: () => Promise<T>): Promise<Attempt<T>> {
  let waits = 0
  for (;;) {
    if (getConnectionStatus() === 'signed-out') return { kind: 'signed-out' }
    if (!linkUp) await waitForRetry(waits++)
    const result = await attempt(fn)
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
  if (waiting > 0 || getConnectionStatus() !== 'offline') return
  if (batchOk) markSaved()
  else setConnectionStatus('ok')
  batchOk = true
}

async function runJob<T>(fn: () => Promise<T>): Promise<T | SignedOutResult> {
  const result = await retryUntilSettled(fn)
  waiting--
  adjustPending(-1)
  if (result.kind === 'signed-out') setConnectionStatus('signed-out')
  else {
    if (!landed(result)) batchOk = false
    endBatchIfIdle()
  }
  return settle(result)
}

/**
 * Runs a Server Action call, FIFO with every other call in this tab. A network failure blocks
 * (status 'offline') and the call is resent on reconnect until it lands; an expired sign-in
 * resolves to a SIGN_IN failure; any other outcome passes through unchanged (a thrown server
 * error is rethrown). A request still open after ATTEMPT_TIMEOUT_MS shows the offline block while
 * the SAME request keeps being awaited. It is abandoned (treated as offline, resent through the
 * normal backoff) when the browser fires `online` after that point, or ABANDON_AFTER_MS after the
 * attempt started: a socket stalled by a network change would otherwise block the quiz forever.
 * Residual: an abandoned request that still lands later can land after its resend; both are
 * latest-wins upserts of the same payload, so only a later-issued position save can be overtaken,
 * inside that window.
 */
export async function withReconnect<T extends ActionResult>(
  fn: () => Promise<T>,
): Promise<T | SignedOutResult> {
  if (getConnectionStatus() === 'signed-out') return SIGNED_OUT
  const idle = waiting === 0
  waiting++
  adjustPending(1)
  const job = idle ? runJob(fn) : tail.then(() => runJob(fn))
  tail = job.catch(() => {})
  return job
}
