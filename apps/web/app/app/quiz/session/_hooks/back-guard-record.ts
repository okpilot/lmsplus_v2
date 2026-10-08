const RECORD_KEY = 'lms-back-guard'

/** Whether the current history entry is the sentinel this runner (`key`) already pushed (survives reload). */
export function onOwnSentinel(key: string): boolean {
  try {
    const raw = window.sessionStorage.getItem(RECORD_KEY)
    if (!raw) return false
    const rec: unknown = JSON.parse(raw)
    if (typeof rec !== 'object' || rec === null) return false
    const r = rec as { key?: unknown; path?: unknown; len?: unknown }
    return r.key === key && r.path === window.location.pathname && r.len === window.history.length
  } catch {
    return false
  }
}

export function recordSentinel(key: string) {
  try {
    const rec = { key, path: window.location.pathname, len: window.history.length }
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
