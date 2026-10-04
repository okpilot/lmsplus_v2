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

const SIGNED_OUT: SignedOutResult = { success: false, error: SIGN_IN }

// One FIFO for the whole tab: ops that failed offline resend in issue order, one at a time.
let tail: Promise<unknown> = Promise.resolve()
let waiting = 0
let linkUp = true

/** @internal Test-only reset for the module-level queue. */
export function _resetWithReconnect() {
  tail = Promise.resolve()
  waiting = 0
  linkUp = true
}

function isHandled(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const r = value as { success?: unknown; error?: unknown }
  if (typeof r.success !== 'boolean') return false
  return !(r.success === false && typeof r.error === 'string' && isSignInError(r.error))
}

async function attempt<T>(fn: () => Promise<T>): Promise<Attempt<T> | { kind: 'offline' }> {
  let value: T | undefined
  let thrown: unknown
  let didThrow = false
  try {
    value = await fn()
    if (isHandled(value)) return { kind: 'done', value: value as T }
  } catch (err) {
    didThrow = true
    thrown = err
  }
  const kind = await classifyFailure(didThrow ? thrown : value)
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

async function retryUntilSettled<T>(fn: () => Promise<T>): Promise<Attempt<T>> {
  for (let i = 0; ; i++) {
    if (getConnectionStatus() === 'signed-out') return { kind: 'signed-out' }
    if (!linkUp) await waitForRetry(i)
    const result = await attempt(fn)
    if (result.kind !== 'offline') {
      linkUp = true
      return result
    }
    linkUp = false
  }
}

function settle<T>(result: Attempt<T>): T | SignedOutResult {
  if (result.kind === 'rethrow') throw result.err
  if (result.kind === 'signed-out') return SIGNED_OUT
  return result.value
}

async function runQueued<T>(fn: () => Promise<T>): Promise<T | SignedOutResult> {
  const last = await retryUntilSettled(fn)
  waiting--
  adjustPending(-1)
  if (last.kind === 'signed-out') setConnectionStatus('signed-out')
  else if (waiting === 0) {
    if (last.kind === 'done') markSaved()
    else setConnectionStatus('ok')
  }
  return settle(last)
}

function enqueue<T>(fn: () => Promise<T>): Promise<T | SignedOutResult> {
  waiting++
  adjustPending(1)
  setConnectionStatus('offline')
  const job = tail.then(() => runQueued(fn))
  tail = job.catch(() => {})
  return job
}

/**
 * Runs a Server Action call. A network failure blocks (status 'offline') and the call is resent
 * on reconnect, FIFO, until it lands; an expired sign-in resolves to a SIGN_IN failure; any other
 * outcome passes through unchanged (a thrown server error is rethrown).
 */
export async function withReconnect<T extends ActionResult>(
  fn: () => Promise<T>,
): Promise<T | SignedOutResult> {
  if (getConnectionStatus() === 'signed-out') return SIGNED_OUT
  if (waiting > 0) return enqueue(fn)
  const first = await attempt(fn)
  if (first.kind === 'offline') {
    linkUp = false
    return enqueue(fn)
  }
  if (first.kind === 'signed-out') setConnectionStatus('signed-out')
  return settle(first)
}
