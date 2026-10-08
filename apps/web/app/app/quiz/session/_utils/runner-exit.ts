let exiting = false
const listeners = new Set<() => void>()

function set(next: boolean) {
  if (exiting === next) return
  exiting = next
  for (const listener of [...listeners]) listener()
}

/** @internal Test-only reset for the module-level state. */
export function _resetRunnerExit() {
  exiting = false
  listeners.clear()
}

export function isRunnerExiting(): boolean {
  return exiting
}

export function subscribeRunnerExit(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Call right before a confirmed navigation away from the runner: releases the leave guards. */
export function markRunnerExiting(): void {
  set(true)
}

/** Re-arms the guards for the next runner; called when the runner unmounts. */
export function resetRunnerExit(): void {
  set(false)
}
