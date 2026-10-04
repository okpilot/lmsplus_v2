export type ConnectionStatus = 'ok' | 'offline' | 'signed-out' | 'saved'
export type ConnectionSnapshot = { status: ConnectionStatus; pending: number }

const SAVED_VISIBLE_MS = 1500

let snapshot: ConnectionSnapshot = { status: 'ok', pending: 0 }
let savedTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function clearSavedTimer() {
  if (savedTimer) clearTimeout(savedTimer)
  savedTimer = null
}

function update(next: Partial<ConnectionSnapshot>) {
  const merged = { ...snapshot, ...next }
  if (merged.status === snapshot.status && merged.pending === snapshot.pending) return
  snapshot = merged
  for (const listener of [...listeners]) listener()
}

/** @internal Test-only reset for the module-level state. */
export function _resetConnectionState() {
  clearSavedTimer()
  snapshot = { status: 'ok', pending: 0 }
  listeners.clear()
}

export function getConnectionSnapshot(): ConnectionSnapshot {
  return snapshot
}

export function getConnectionStatus(): ConnectionStatus {
  return snapshot.status
}

export function subscribeConnection(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setConnectionStatus(status: ConnectionStatus): void {
  clearSavedTimer()
  update({ status })
}

export function adjustPending(delta: number): void {
  update({ pending: Math.max(0, snapshot.pending + delta) })
}

/** Shows 'saved' briefly, then returns to 'ok' unless something else changed the status. */
export function markSaved(): void {
  setConnectionStatus('saved')
  savedTimer = setTimeout(() => {
    savedTimer = null
    if (snapshot.status === 'saved') update({ status: 'ok' })
  }, SAVED_VISIBLE_MS)
}
