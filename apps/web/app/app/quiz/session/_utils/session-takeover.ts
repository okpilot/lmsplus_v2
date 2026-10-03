import { getQuizDeviceId } from './quiz-device-id'

const CHANNEL_NAME = 'lmsplus-quiz-claim'

const takenOver = new Set<string>()
const listeners = new Map<string, Set<() => void>>()

/** @internal Test-only reset for the module-level state. */
export function _resetSessionTakeover() {
  takenOver.clear()
  listeners.clear()
}

/** Records that another tab or device holds the session; notifies this tab's listeners once. */
export function markTakenOver(sessionId: string): void {
  if (takenOver.has(sessionId)) return
  takenOver.add(sessionId)
  for (const listener of [...(listeners.get(sessionId) ?? [])]) listener()
}

export function isTakenOver(sessionId: string): boolean {
  return takenOver.has(sessionId)
}

export function clearTakenOver(sessionId: string): void {
  takenOver.delete(sessionId)
}

export function onTakenOver(sessionId: string, listener: () => void): () => void {
  const set = listeners.get(sessionId) ?? new Set<() => void>()
  set.add(listener)
  listeners.set(sessionId, set)
  return () => {
    set.delete(listener)
  }
}

/** Tells other tabs of this browser that this tab now owns the session. Never throws. */
export function announceClaim(sessionId: string): void {
  if (typeof BroadcastChannel === 'undefined') return
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channel.postMessage({ sessionId, deviceId: getQuizDeviceId() })
    channel.close()
  } catch (err) {
    console.warn('[session-takeover] announce failed (best-effort):', err)
  }
}

/** Calls `cb` when another tab of this browser announces a claim of `sessionId`. */
export function onPeerClaim(sessionId: string, cb: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {}
  let channel: BroadcastChannel
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
  } catch (err) {
    console.warn('[session-takeover] listen failed (best-effort):', err)
    return () => {}
  }
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data
    if (typeof data !== 'object' || data === null) return
    const msg = data as { sessionId?: unknown; deviceId?: unknown }
    if (typeof msg.sessionId !== 'string' || typeof msg.deviceId !== 'string') return
    if (msg.sessionId !== sessionId || msg.deviceId === getQuizDeviceId()) return
    cb()
  }
  return () => channel.close()
}
