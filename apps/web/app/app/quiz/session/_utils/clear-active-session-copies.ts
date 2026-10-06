import { ACTIVE_SESSION_KEY_PREFIX } from './quiz-session-storage'

function storedSessionId(key: string): unknown {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    return typeof data === 'object' && data !== null && 'sessionId' in data
      ? data.sessionId
      : undefined
  } catch {
    return undefined
  }
}

function clearCopies(matches: (storedId: unknown) => boolean): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(ACTIVE_SESSION_KEY_PREFIX)) keys.push(key)
    }
    for (const key of keys) {
      if (matches(storedSessionId(key))) localStorage.removeItem(key)
    }
  } catch {
    // Private browsing SecurityError — nothing stored to clear.
  }
}

/** Removes this browser's local copy of `sessionId`, whichever user key holds it. Best effort. */
export function clearActiveSessionById(sessionId: string): void {
  clearCopies((id) => id === sessionId)
}

/** Removes every local copy except `sessionId`'s: once it is open, any other copy is stale. */
export function clearActiveSessionsExcept(sessionId: string): void {
  clearCopies((id) => id !== sessionId)
}
