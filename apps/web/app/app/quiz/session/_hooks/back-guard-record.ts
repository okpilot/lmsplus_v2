const RECORD_KEY = 'lms-back-guard'

/** Whether the current history entry is the sentinel this tab already pushed (survives reload). */
export function onOwnSentinel(): boolean {
  try {
    const raw = window.sessionStorage.getItem(RECORD_KEY)
    if (!raw) return false
    const rec: unknown = JSON.parse(raw)
    if (typeof rec !== 'object' || rec === null) return false
    const { path, len } = rec as { path?: unknown; len?: unknown }
    return path === window.location.pathname && len === window.history.length
  } catch {
    return false
  }
}

export function recordSentinel() {
  try {
    const rec = { path: window.location.pathname, len: window.history.length }
    window.sessionStorage.setItem(RECORD_KEY, JSON.stringify(rec))
  } catch {
    // Storage unavailable: every arm pushes a sentinel.
  }
}

export function clearSentinelRecord() {
  try {
    window.sessionStorage.removeItem(RECORD_KEY)
  } catch {
    // Nothing to clear.
  }
}
