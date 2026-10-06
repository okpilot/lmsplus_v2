import { isNonEmptyString } from './quiz-session-validators'

export const ACTIVE_SESSION_KEY_PREFIX = 'quiz-active-session:'
const storageKey = (userId: string) => `${ACTIVE_SESSION_KEY_PREFIX}${userId}`

export type ActiveSession = {
  userId: string
  sessionId: string
}

function safeRemove(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId))
  } catch {
    // Swallow — best effort
  }
}

function isActiveSession(data: unknown, userId: string): data is ActiveSession {
  if (typeof data !== 'object' || data === null) return false
  const entry = data as Record<string, unknown>
  return entry.userId === userId && isNonEmptyString(entry.sessionId)
}

export function readActiveSession(userId: string): ActiveSession | null {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const data: unknown = JSON.parse(raw)
    if (!isActiveSession(data, userId)) {
      safeRemove(userId)
      return null
    }
    return { userId: data.userId, sessionId: data.sessionId }
  } catch {
    // Malformed JSON or other error
    safeRemove(userId)
    return null
  }
}

export function clearActiveSession(userId: string): void {
  safeRemove(userId)
}

/**
 * Clears a legacy entry only when it names `sessionId`, so a stale tab never clears one that
 * names another session. Returns whether it cleared.
 */
export function clearActiveSessionIfCurrent(userId: string, sessionId: string): boolean {
  if (readActiveSession(userId)?.sessionId !== sessionId) return false
  safeRemove(userId)
  return true
}
