let exiting = false
// Bumped on every runner mount and unmount; an exit started by an earlier runner is stale.
let generation = 0
const listeners = new Set<() => void>()

function set(next: boolean) {
  if (exiting === next) return
  exiting = next
  for (const listener of [...listeners]) listener()
}

/** @internal Test-only reset for the module-level state. */
export function _resetRunnerExit() {
  exiting = false
  generation = 0
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

/** Re-arms the guards; called when a runner mounts and when it unmounts. */
export function resetRunnerExit(): void {
  generation += 1
  set(false)
}

/** Identifies the runner mounted right now; capture it before an await that ends in an exit. */
export function runnerToken(): number {
  return generation
}

/** False once a runner mounted or unmounted since `token` was taken. */
export function isCurrentRunner(token: number): boolean {
  return token === generation
}
