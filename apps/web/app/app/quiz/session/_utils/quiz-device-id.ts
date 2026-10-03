/** sessionStorage key holding this browser tab's device id for quiz progress saves. */
export const QUIZ_DEVICE_ID_KEY = 'quiz-device-id'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let cached: string | null = null

/** @internal Test-only reset for the module-level cache. */
export function _resetQuizDeviceId() {
  cached = null
}

function randomHex(): string {
  return Math.floor(Math.random() * 16).toString(16)
}

/** v4-shaped uuid for origins where crypto.randomUUID is unavailable (non-secure context). */
function fallbackUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) =>
    c === 'x' ? randomHex() : (8 + Math.floor(Math.random() * 4)).toString(16),
  )
}

function generateUuid(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : fallbackUuid()
}

function readStored(): string | null {
  try {
    const stored = sessionStorage.getItem(QUIZ_DEVICE_ID_KEY)
    return stored && UUID_V4.test(stored) ? stored : null
  } catch {
    return null
  }
}

/**
 * Per-browser-tab device id (sessionStorage is tab-scoped). Falls back to an in-memory id when
 * storage throws. Call from handlers/effects/loaders only — SSR has no sessionStorage.
 */
export function getQuizDeviceId(): string {
  if (cached) return cached
  const id = readStored() ?? generateUuid()
  try {
    sessionStorage.setItem(QUIZ_DEVICE_ID_KEY, id)
  } catch {
    // Storage unavailable — the module cache keeps the id stable for this page load.
  }
  cached = id
  return id
}
